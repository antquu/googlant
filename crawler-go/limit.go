// Googlant by antquu (github.com/antquu)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Garde-fous pour la box internet : une box grand public garde chaque connexion dans une table
// de taille limitée (NAT). Trop de connexions ouvertes, ou ouvertes trop vite, et elle sature
// pour toute la maison. Ici : un plafond strict de connexions ouvertes en même temps et un
// nombre maximum de nouvelles connexions par seconde, quels que soient les autres réglages.

package main

import (
	"context"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

const (
	hardMaxConns = 150 // connexions ouvertes en même temps, jamais plus
	hardConnRate = 25  // nouvelles connexions par seconde, jamais plus
)

type connLimiter struct {
	slots   chan struct{}
	tokens  chan struct{}
	open    atomic.Int64
	stopped chan struct{}
}

func newConnLimiter(maxOpen, perSecond int) *connLimiter {
	l := &connLimiter{
		slots:   make(chan struct{}, maxOpen),
		tokens:  make(chan struct{}, perSecond),
		stopped: make(chan struct{}),
	}
	// seau à jetons : perSecond nouvelles connexions par seconde au maximum
	go func() {
		t := time.NewTicker(time.Second / time.Duration(max(perSecond, 1)))
		defer t.Stop()
		for {
			select {
			case <-t.C:
				select {
				case l.tokens <- struct{}{}:
				default:
				}
			case <-l.stopped:
				return
			}
		}
	}()
	return l
}

// conn qui rend sa place au plafond quand elle se ferme
type limitedConn struct {
	net.Conn
	once sync.Once
	l    *connLimiter
}

func (c *limitedConn) Close() error {
	c.once.Do(func() {
		c.l.open.Add(-1)
		<-c.l.slots
	})
	return c.Conn.Close()
}

func (l *connLimiter) wrap(dial func(ctx context.Context, network, addr string) (net.Conn, error)) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(parent context.Context, network, addr string) (net.Conn, error) {
		// jamais plus de 12 s pour ouvrir une connexion (DNS compris) : une place ne reste pas bloquée
		ctx, cancel := context.WithTimeout(parent, 12*time.Second)
		defer cancel()
		select {
		case l.slots <- struct{}{}:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		select {
		case <-l.tokens:
		case <-ctx.Done():
			<-l.slots
			return nil, ctx.Err()
		}
		conn, err := dial(ctx, network, addr)
		if err != nil {
			<-l.slots
			return nil, err
		}
		l.open.Add(1)
		return &limitedConn{Conn: conn, l: l}, nil
	}
}

// jobGate : nombre de pages en cours et pages lancées par seconde, avec attente AVANT la requête
type jobGate struct {
	slots  chan struct{}
	tokens chan struct{}
	mu     sync.Mutex
	held   map[int64]bool
}

var jobs *jobGate

func newJobGate(maxJobs, perSecond int) *jobGate {
	g := &jobGate{slots: make(chan struct{}, maxJobs), tokens: make(chan struct{}, perSecond), held: map[int64]bool{}}
	go func() {
		t := time.NewTicker(time.Second / time.Duration(perSecond))
		defer t.Stop()
		for range t.C {
			select {
			case g.tokens <- struct{}{}:
			default:
			}
		}
	}()
	return g
}

func (g *jobGate) acquire(id int64) {
	g.slots <- struct{}{}
	<-g.tokens
	g.mu.Lock()
	g.held[id] = true
	g.mu.Unlock()
}

// appelé une fois le résultat de la page envoyé
func (g *jobGate) release(id int64) {
	g.mu.Lock()
	ok := g.held[id]
	delete(g.held, id)
	g.mu.Unlock()
	if ok {
		<-g.slots
	}
}
