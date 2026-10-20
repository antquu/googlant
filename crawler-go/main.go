// Googlant by antquu (github.com/antquu)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Moteur de crawl de Googlant, en Go avec Colly : téléchargement, robots.txt, politesse par
// site et analyse des pages sur tous les cœurs. Il ne touche pas à la base : crawler/daemon.ts
// (--engine go) lui envoie les URLs à visiter sur l'entrée standard et indexe ce qu'il renvoie.
//
//   entrée  : {"id":1,"url":"https://..."}            une ligne par URL
//   sortie  : {"id":1,"kind":"html","status":200,"finalUrl":"...","page":{...}}

package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/gocolly/colly/v2"
	"golang.org/x/net/html/charset"
)

// pages en latin-1, windows-1252... : conversion en UTF-8 d'après l'en-tête ou la balise <meta charset>
func toUTF8(body []byte, contentType string) []byte {
	if utf8.Valid(body) {
		return body
	}
	r, err := charset.NewReader(bytes.NewReader(body), contentType)
	if err != nil {
		return body
	}
	out, err := io.ReadAll(r)
	if err != nil {
		return body
	}
	return out
}

type Job struct {
	ID  int64  `json:"id"`
	URL string `json:"url"`
}

type Result struct {
	ID       int64      `json:"id"`
	Kind     string     `json:"kind"` // html, pdf, skip, http, robots, error
	Status   int        `json:"status,omitempty"`
	FinalURL string     `json:"finalUrl,omitempty"`
	Page     *Extracted `json:"page,omitempty"`
	Pdf      *PdfInfo   `json:"pdf,omitempty"`
	Error    string     `json:"error,omitempty"`
}

func main() {
	ua := flag.String("ua", "GooglantBot/1.0 (+https://github.com/antquu; moteur de recherche open source)", "User-Agent")
	delay := flag.Duration("delay", time.Second, "délai minimum entre deux pages d'un même site")
	timeout := flag.Duration("timeout", 10*time.Second, "délai maximum par page")
	maxBody := flag.Int("max-body", 3<<20, "taille maximum d'une page (octets)")
	dnsParallel := flag.Int("dns-parallel", 32, "résolutions DNS simultanées au maximum")
	maxConns := flag.Int("max-conns", 60, "connexions TCP ouvertes en même temps au maximum (protège la box)")
	connRate := flag.Int("conn-rate", 15, "nouvelles connexions par seconde au maximum (protège la box)")
	flag.Parse()

	// plafonds absolus, quels que soient les réglages : une box grand public garde chaque connexion
	// ~2 min dans sa table NAT, même fermée. 25 nouvelles/s ~ 3 000 entrées, elle tient sans planter.
	if *maxConns > hardMaxConns {
		fmt.Fprintf(os.Stderr, "max-conns %d ramené à %d pour protéger la box\n", *maxConns, hardMaxConns)
		*maxConns = hardMaxConns
	}
	if *connRate > hardConnRate {
		fmt.Fprintf(os.Stderr, "conn-rate %d ramené à %d pour protéger la box\n", *connRate, hardConnRate)
		*connRate = hardConnRate
	}

	out := make(chan Result, 256)
	var done, fetched atomic.Int64

	c := colly.NewCollector(
		colly.Async(true),
		colly.UserAgent(*ua),
		colly.MaxBodySize(*maxBody),
		colly.AllowURLRevisit(),
	)
	// encodage converti par nos soins, seulement pour le HTML (la détection de Colly abîmerait les PDF)
	c.DetectCharset = false
	// Colly ignore robots.txt par défaut : on le respecte
	c.IgnoreRobotsTxt = false
	c.SetRequestTimeout(*timeout)
	// la politesse par site (une page à la fois, puis -delay) est assurée par la file côté Node :
	// une LimitRule "*" de Colly limiterait l'ensemble des sites à la fois, pas chaque site
	_ = delay
	dialer := &net.Dialer{Timeout: 6 * time.Second, KeepAlive: 30 * time.Second}
	limiter := newConnLimiter(*maxConns, *connRate)
	// une page = jusqu'à 2 connexions (robots.txt d'un nouveau site + la page) : on lance les pages
	// à la moitié du rythme permis, pour que le plafond des connexions ne fasse presque jamais attendre
	jobs = newJobGate(max(*maxConns/2, 1), max(*connRate/2, 1))
	c.WithTransport(&http.Transport{
		Proxy: http.ProxyFromEnvironment,
		// IPv4 seulement, DNS en cache (dns.go) et plafond de connexions pour la box (limit.go)
		DialContext:       limiter.wrap(newDNSCache(*dnsParallel).dial(dialer)),
		ForceAttemptHTTP2: true,
		// peu de connexions inactives gardées, et fermées vite : elles comptent aussi dans la box
		MaxIdleConns:          *maxConns / 2,
		MaxIdleConnsPerHost:   1,
		IdleConnTimeout:       5 * time.Second,
		TLSHandshakeTimeout:   6 * time.Second,
		ResponseHeaderTimeout: *timeout,
	})

	c.OnRequest(func(r *colly.Request) {
		r.Headers.Set("Accept", "text/html,application/xhtml+xml,application/pdf;q=0.8")
		r.Headers.Set("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.7")
	})

	c.OnResponse(func(r *colly.Response) {
		fetched.Add(1)
		id := idOf(r.Ctx)
		res := Result{ID: id, Status: r.StatusCode, FinalURL: r.Request.URL.String()}
		ctype := strings.ToLower(r.Headers.Get("Content-Type"))
		switch {
		case strings.Contains(ctype, "application/pdf") || strings.HasSuffix(strings.ToLower(r.Request.URL.Path), ".pdf"):
			if p := extractPDF(r.Body, r.Request.URL); p != nil {
				res.Kind, res.Pdf = "pdf", p
			} else {
				res.Kind = "skip"
			}
		case strings.Contains(ctype, "html") || ctype == "":
			page, err := extractHTML(toUTF8(r.Body, ctype), r.Request.URL)
			if err != nil {
				res.Kind, res.Error = "error", err.Error()
			} else {
				res.Kind, res.Page = "html", page
			}
		default:
			res.Kind = "skip"
		}
		out <- res
	})

	c.OnError(func(r *colly.Response, err error) {
		id := idOf(r.Ctx)
		if r.StatusCode > 0 {
			out <- Result{ID: id, Kind: "http", Status: r.StatusCode, FinalURL: r.Request.URL.String()}
			return
		}
		out <- Result{ID: id, Kind: "error", Error: cut(err.Error(), 160)}
	})

	// un seul écrivain sur la sortie standard
	writerDone := make(chan struct{})
	go func() {
		w := bufio.NewWriterSize(os.Stdout, 1<<16)
		enc := json.NewEncoder(w)
		enc.SetEscapeHTML(false)
		for res := range out {
			_ = enc.Encode(res)
			done.Add(1)
			jobs.release(res.ID)
			statsMu.Lock()
			kinds[res.Kind]++
			if res.Error != "" {
				errs[errKey(res.Error)]++
			}
			statsMu.Unlock()
			if len(out) == 0 {
				_ = w.Flush()
			}
		}
		_ = w.Flush()
		close(writerDone)
	}()

	go func() {
		for range time.Tick(time.Minute) {
			statsMu.Lock()
			top := ""
			for k, n := range errs {
				if n > 20 {
					top += fmt.Sprintf(" [%d× %s]", n, k)
				}
			}
			fmt.Fprintf(os.Stderr, "colly : %d pages téléchargées, %d connexions ouvertes, %d places prises (max %d), %d pages en cours, sur la dernière minute %v%s\n", fetched.Load(), limiter.open.Load(), len(limiter.slots), *maxConns, len(jobs.slots), kinds, top)
			kinds = map[string]int{}
			errs = map[string]int{}
			statsMu.Unlock()
		}
	}()

	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 64<<10), 1<<20)
	var pending sync.WaitGroup
	for in.Scan() {
		var job Job
		if err := json.Unmarshal(in.Bytes(), &job); err != nil || job.URL == "" {
			continue
		}
		// la vérification du robots.txt peut télécharger le fichier : jamais sur la boucle de lecture
		pending.Add(1)
		go func(job Job) {
			defer pending.Done()
			// attendre son tour AVANT de lancer la requête : l'attente ne doit pas manger les secondes
			// du délai de la page (sinon plus on bride, plus tout finit en délai dépassé)
			jobs.acquire(job.ID)
			ctx := colly.NewContext()
			ctx.Put("id", job.ID)
			if err := c.Request("GET", job.URL, nil, ctx, nil); err != nil {
				switch {
				case errors.Is(err, colly.ErrRobotsTxtBlocked):
					out <- Result{ID: job.ID, Kind: "robots"}
				default:
					out <- Result{ID: job.ID, Kind: "error", Error: cut(err.Error(), 160)}
				}
			}
		}(job)
	}
	pending.Wait()
	c.Wait()
	close(out)
	<-writerDone
}

// répartition des résultats, affichée chaque minute pour voir où part le temps
var (
	statsMu sync.Mutex
	kinds   = map[string]int{}
	errs    = map[string]int{}
)

// message d'erreur sans l'URL, pour regrouper les erreurs du même genre
func errKey(e string) string {
	if i := strings.LastIndex(e, ": "); i >= 0 {
		e = e[i+2:]
	}
	return cut(e, 60)
}

func idOf(ctx *colly.Context) int64 {
	if ctx == nil {
		return 0
	}
	if v, ok := ctx.GetAny("id").(int64); ok {
		return v
	}
	return 0
}
