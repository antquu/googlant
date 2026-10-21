// Googlant by antquu (github.com/antquu)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Résolution DNS du crawler : cache en mémoire et nombre de requêtes DNS simultanées limité.
// Sans ça, des milliers de connexions en parallèle saturent le résolveur (et la box) et finissent
// en "i/o timeout". Les DNS publics ne servent que si GOOGLANT_PUBLIC_DNS=1.

package main

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net"
	"os"
	"sync"
	"time"
)

var publicDNS = []string{"1.1.1.1:53", "8.8.8.8:53", "9.9.9.9:53", "1.0.0.1:53", "8.8.4.4:53"}

type dnsEntry struct {
	ips []net.IP
	err error
	exp time.Time
}

type dnsCache struct {
	mu       sync.Mutex
	entries  map[string]*dnsEntry
	inflight map[string]chan struct{}
	sem      chan struct{}
	resolver *net.Resolver
}

func newDNSCache(parallel int) *dnsCache {
	d := &net.Dialer{Timeout: 3 * time.Second}
	return &dnsCache{
		entries:  map[string]*dnsEntry{},
		inflight: map[string]chan struct{}{},
		sem:      make(chan struct{}, parallel),
		// résolveur du système (cache local de systemd-resolved) ; publicDNS seulement si GOOGLANT_PUBLIC_DNS=1
		resolver: systemOrPublic(d),
	}
}

var errNoIPv4 = errors.New("pas d'adresse IPv4")

func (c *dnsCache) lookup(ctx context.Context, host string) ([]net.IP, error) {
	if ip := net.ParseIP(host); ip != nil {
		return []net.IP{ip}, nil
	}
	for {
		c.mu.Lock()
		if e, ok := c.entries[host]; ok && time.Now().Before(e.exp) {
			c.mu.Unlock()
			return e.ips, e.err
		}
		// une seule résolution par nom à la fois, les autres attendent son résultat
		if wait, ok := c.inflight[host]; ok {
			c.mu.Unlock()
			select {
			case <-wait:
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		done := make(chan struct{})
		c.inflight[host] = done
		if len(c.entries) > 200_000 {
			c.entries = map[string]*dnsEntry{}
		}
		c.mu.Unlock()

		ips, err := c.resolve(ctx, host)
		ttl := 15 * time.Minute
		if err != nil {
			ttl = 2 * time.Minute
		}
		c.mu.Lock()
		c.entries[host] = &dnsEntry{ips: ips, err: err, exp: time.Now().Add(ttl)}
		delete(c.inflight, host)
		c.mu.Unlock()
		close(done)
		return ips, err
	}
}

func (c *dnsCache) resolve(ctx context.Context, host string) ([]net.IP, error) {
	select {
	case c.sem <- struct{}{}:
		defer func() { <-c.sem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		lctx, cancel := context.WithTimeout(ctx, 4*time.Second)
		addrs, err := c.resolver.LookupIP(lctx, "ip4", host)
		cancel()
		if err == nil {
			if len(addrs) == 0 {
				return nil, errNoIPv4
			}
			return addrs, nil
		}
		lastErr = err
		var dnsErr *net.DNSError
		if errors.As(err, &dnsErr) && dnsErr.IsNotFound {
			break
		}
	}
	return nil, lastErr
}

// 100.64.0.0/10 : adresses Tailscale et CGNAT des opérateurs
var cgnat = &net.IPNet{IP: net.IPv4(100, 64, 0, 0), Mask: net.CIDRMask(10, 32)}

// DialContext pour le transport HTTP : IPv4 seulement, adresse tirée du cache
func (c *dnsCache) dial(dialer *net.Dialer) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, _ string, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		ips, err := c.lookup(ctx, host)
		if err != nil {
			return nil, err
		}
		// un site public qui redirige vers localhost ou la box : refusé (seulement des adresses publiques)
		public := ips[:0:0]
		for _, ip := range ips {
			if !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified() && !cgnat.Contains(ip) {
				public = append(public, ip)
			}
		}
		if len(public) == 0 {
			return nil, fmt.Errorf("adresse privée refusée : %s", host)
		}
		ips = public
		var lastErr error
		for _, ip := range ips[:min(len(ips), 2)] {
			conn, err := dialer.DialContext(ctx, "tcp4", net.JoinHostPort(ip.String(), port))
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		return nil, lastErr
	}
}

func systemOrPublic(d *net.Dialer) *net.Resolver {
	if os.Getenv("GOOGLANT_PUBLIC_DNS") != "1" {
		return net.DefaultResolver
	}
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return d.DialContext(ctx, network, publicDNS[rand.IntN(len(publicDNS))])
		},
	}
}
