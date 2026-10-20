// Googlant by antquu (github.com/antquu)
// SPDX-License-Identifier: GPL-3.0-or-later

package main

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

// même structure que crawler/extract.ts : le côté Node indexe ces champs tels quels
type Image struct {
	Src string `json:"src"`
	Alt string `json:"alt"`
}

type Extracted struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Headings    []string `json:"headings"`
	Text        string   `json:"text"`
	Lang        string   `json:"lang,omitempty"`
	Canonical   string   `json:"canonical,omitempty"`
	SiteName    string   `json:"siteName,omitempty"`
	Favicon     string   `json:"favicon,omitempty"`
	Image       string   `json:"image,omitempty"`
	PublishedAt string   `json:"publishedAt,omitempty"`
	Images      []Image  `json:"images"`
	Links       []string `json:"links"`
	Noindex     bool     `json:"noindex"`
	Nofollow    bool     `json:"nofollow"`
	ContentHash string   `json:"contentHash"`
}

var (
	spaces    = regexp.MustCompile(`\s+`)
	refMarks  = regexp.MustCompile(`(?i)\[\s*(\d+|[a-z]|note \d+)\s*\]`)
	coordLead = regexp.MustCompile(`(?i)^(coordonn|\d+°)`)
	ldDate    = regexp.MustCompile(`"datePublished"\s*:\s*"([^"]+)"`)
	svgURL    = regexp.MustCompile(`(?i)\.svg(\?|$)`)
	// même liste que lib/search/engine.ts (JUNK_IMAGE / JUNK_ALT)
	junkImage = regexp.MustCompile(`(?i)(logo|favicon|icon|sprite|avatar|gravatar|badge|button|btn[-_]|pixel|spacer|blank\.|placeholder|emoji|smiley|banner-ad|/ads?/|rating|stars?[-_.]|arrow|loader|loading|spinner|social|share|facebook|twitter|linkedin|instagram|youtube-|whatsapp|pinterest|flag[-_/]|cookie|captcha|qr[-_]?code|header|footer|bandeau|picto|numero[-_]?vert|type[-_]article|default[-_.]|no[-_]?image|thumbnail[-_]default)`)
	junkAlt   = regexp.MustCompile(`(?i)^(logo|icône|icon|image|photo|picture|img|avatar|banner|bannière|button|bouton)\b|\blogo\b`)
)

func clean(s string) string { return strings.TrimSpace(spaces.ReplaceAllString(s, " ")) }

func cut(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func abs(href string, base *url.URL) string {
	u, err := base.Parse(strings.TrimSpace(href))
	if err != nil {
		return ""
	}
	u.Fragment = ""
	return u.String()
}

func published(doc *goquery.Document) string {
	cand, _ := doc.Find(`meta[property="article:published_time"]`).Attr("content")
	if cand == "" {
		cand, _ = doc.Find(`meta[name="date"]`).Attr("content")
	}
	if cand == "" {
		cand, _ = doc.Find(`meta[itemprop="datePublished"]`).Attr("content")
	}
	if cand == "" {
		doc.Find(`script[type="application/ld+json"]`).EachWithBreak(func(_ int, s *goquery.Selection) bool {
			if m := ldDate.FindStringSubmatch(s.Text()); m != nil {
				cand = m[1]
				return false
			}
			return true
		})
	}
	if cand == "" {
		return ""
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z0700", "2006-01-02T15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, cand); err == nil {
			if t.After(time.Now().Add(24*time.Hour)) || t.Year() < 1995 {
				return ""
			}
			return t.UTC().Format("2006-01-02T15:04:05.000Z")
		}
	}
	return ""
}

func extractHTML(body []byte, pageURL *url.URL) (*Extracted, error) {
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	base := pageURL
	if href, ok := doc.Find("base[href]").Attr("href"); ok {
		if b, err := pageURL.Parse(href); err == nil {
			base = b
		}
	}
	robots := strings.ToLower(attr(doc, `meta[name="robots"]`, "content"))

	title := clean(doc.Find("title").First().Text())
	if title == "" {
		title = clean(attr(doc, `meta[property="og:title"]`, "content"))
	}
	if title == "" {
		title = clean(doc.Find("h1").First().Text())
	}

	description := clean(attr(doc, `meta[name="description"]`, "content"))
	if description == "" {
		description = clean(attr(doc, `meta[property="og:description"]`, "content"))
	}
	if description == "" {
		doc.Find("main p, article p, [role=main] p, #mw-content-text p, body p").EachWithBreak(func(_ int, s *goquery.Selection) bool {
			p := refMarks.ReplaceAllString(clean(s.Text()), "")
			if len(p) > 90 && len(strings.Fields(p)) > 12 && !coordLead.MatchString(p) {
				description = cut(p, 320)
				return false
			}
			return true
		})
	}

	out := &Extracted{
		Title:       cut(title, 300),
		Description: cut(description, 500),
		Lang:        strings.ToLower(cut(clean(attr(doc, "html", "lang")), 5)),
		SiteName:    clean(attr(doc, `meta[property="og:site_name"]`, "content")),
		PublishedAt: published(doc),
		Noindex:     strings.Contains(robots, "noindex"),
		Nofollow:    strings.Contains(robots, "nofollow"),
		Images:      []Image{},
		Headings:    []string{},
		Links:       []string{},
	}
	if href := attr(doc, `link[rel="canonical"]`, "href"); href != "" {
		out.Canonical = abs(href, base)
	}
	if href := attr(doc, `link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]`, "href"); href != "" {
		out.Favicon = abs(href, base)
	} else {
		out.Favicon = abs("/favicon.ico", base)
	}
	if og := attr(doc, `meta[property="og:image"]`, "content"); og != "" {
		out.Image = abs(og, base)
	}

	// liens bruts (absolus) : la normalisation est faite côté Node, la même que partout ailleurs
	seen := map[string]bool{}
	doc.Find("a[href]").Each(func(_ int, s *goquery.Selection) {
		if len(out.Links) >= 400 || strings.Contains(strings.ToLower(s.AttrOr("rel", "")), "nofollow") {
			return
		}
		href := s.AttrOr("href", "")
		if href == "" || strings.HasPrefix(href, "#") || strings.HasPrefix(strings.ToLower(href), "javascript:") || strings.HasPrefix(strings.ToLower(href), "mailto:") {
			return
		}
		if u := abs(href, base); u != "" && !seen[u] && strings.HasPrefix(u, "http") {
			seen[u] = true
			out.Links = append(out.Links, u)
		}
	})

	doc.Find("img[src], img[data-src]").EachWithBreak(func(_ int, s *goquery.Selection) bool {
		if len(out.Images) >= 12 {
			return false
		}
		alt := clean(s.AttrOr("alt", ""))
		src := s.AttrOr("src", "")
		if src == "" {
			src = s.AttrOr("data-src", "")
		}
		w, _ := strconv.Atoi(s.AttrOr("width", "0"))
		h, _ := strconv.Atoi(s.AttrOr("height", "0"))
		// logos, icônes, boutons, petites vignettes : pas des images qu'on veut montrer
		if src == "" || strings.HasPrefix(src, "data:") || len([]rune(alt)) < 4 || (w > 0 && w < 200) || (h > 0 && h < 120) || junkImage.MatchString(src) || junkAlt.MatchString(alt) {
			return true
		}
		if a := abs(src, base); strings.HasPrefix(a, "http") && !svgURL.MatchString(a) {
			out.Images = append(out.Images, Image{Src: a, Alt: alt})
		}
		return true
	})

	doc.Find("h1, h2, h3").EachWithBreak(func(_ int, s *goquery.Selection) bool {
		h := clean(s.Text())
		if len([]rune(h)) > 1 && len([]rune(h)) < 160 {
			out.Headings = append(out.Headings, h)
		}
		return len(out.Headings) < 30
	})

	doc.Find("script, style, noscript, template, svg, iframe, nav, footer, header, form, [aria-hidden=true], .cookie, #cookie-banner").Remove()
	main := doc.Find("main, article, [role=main]").First()
	if main.Length() == 0 {
		main = doc.Find("body")
	}
	out.Text = cut(clean(main.Text()), 60_000)

	h := sha1.Sum([]byte(out.Title + "\n" + out.Description + "\n" + cut(out.Text, 20_000)))
	out.ContentHash = hex.EncodeToString(h[:])
	return out, nil
}

func attr(doc *goquery.Document, sel, name string) string {
	v, _ := doc.Find(sel).First().Attr(name)
	return v
}
