// Googlant by antquu (github.com/antquu)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Même extraction PDF minimaliste que crawler/pdf.ts : titre des métadonnées et texte des
// flux FlateDecode. Les PDF scannés ou à polices CID ne donnent que leur titre.

package main

import (
	"bytes"
	"compress/zlib"
	"crypto/sha1"
	"encoding/hex"
	"io"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
)

type PdfInfo struct {
	Title       string `json:"title"`
	Text        string `json:"text"`
	Lang        string `json:"lang,omitempty"`
	ContentHash string `json:"contentHash"`
}

var (
	pdfStream   = regexp.MustCompile(`stream\r?\n`)
	pdfSkipDict = regexp.MustCompile(`/Subtype\s*/Image|/Type\s*/XObject|/Length1|/FontFile`)
	pdfTitleHex = regexp.MustCompile(`/Title\s*<([0-9a-fA-F\s]+)>`)
	pdfTitleLit = regexp.MustCompile(`/Title\s*\(`)
	pdfBT       = regexp.MustCompile(`\bBT\b`)
	pdfKern     = regexp.MustCompile(`^-(\d{3,})`)
	pdfCtrl     = regexp.MustCompile(`[\x00-\x08\x0b-\x1f]`)
	pdfHSpace   = regexp.MustCompile(`[^\S\n]+`)
	pdfBlank    = regexp.MustCompile(`\n\s*\n+`)
	pdfLetters  = regexp.MustCompile(`[a-zA-ZÀ-ÿ]`)
	pdfBadTitle = regexp.MustCompile(`(?i)^(untitled|sans titre|microsoft word.*|document\d*|\d+)$`)
	pdfFileLike = regexp.MustCompile(`^[\w.-]+$`)
	pdfWordy    = regexp.MustCompile(`[a-zA-ZÀ-ÿ]{4,}`)
	pdfShouty   = regexp.MustCompile(`^[A-Z0-9 ]{12,}$`)
	pdfFr       = regexp.MustCompile(`(?i)\b(le|la|les|des|est|pour|dans|une)\b`)
	pdfEn       = regexp.MustCompile(`(?i)\b(the|and|for|with|this)\b`)
)

func latin1(b []byte) string {
	r := make([]rune, len(b))
	for i, c := range b {
		r[i] = rune(c)
	}
	return string(r)
}

func pdfString(s []byte) string {
	if len(s) >= 2 && s[0] == 0xfe && s[1] == 0xff {
		r := []rune{}
		for i := 2; i+1 < len(s); i += 2 {
			r = append(r, rune(int(s[i])<<8|int(s[i+1])))
		}
		return string(r)
	}
	return latin1(s)
}

// lit une chaîne littérale « (…) » équilibrée ; renvoie ses octets décodés et la position après « ) »
func readLiteral(src []byte, start int) ([]byte, int) {
	depth := 0
	i := start
scan:
	for ; i < len(src); i++ {
		switch src[i] {
		case '\\':
			i++
		case '(':
			depth++
		case ')':
			if depth--; depth == 0 {
				break scan
			}
		}
	}
	end := i
	if end > len(src) {
		end = len(src)
	}
	raw := src[min(start+1, end):end]
	out := make([]byte, 0, len(raw))
	for j := 0; j < len(raw); j++ {
		c := raw[j]
		if c != '\\' || j+1 >= len(raw) {
			out = append(out, c)
			continue
		}
		j++
		n := raw[j]
		switch {
		case n == 'n':
			out = append(out, '\n')
		case n == 'r':
			out = append(out, '\r')
		case n == 't':
			out = append(out, '\t')
		case n == 'b' || n == 'f':
			out = append(out, ' ')
		case n >= '0' && n <= '7':
			oct := string(n)
			for len(oct) < 3 && j+1 < len(raw) && raw[j+1] >= '0' && raw[j+1] <= '7' {
				j++
				oct += string(raw[j])
			}
			v, _ := strconv.ParseUint(oct, 8, 8)
			out = append(out, byte(v))
		case n == '\r' || n == '\n':
			if n == '\r' && j+1 < len(raw) && raw[j+1] == '\n' {
				j++
			}
		default:
			out = append(out, n)
		}
	}
	return out, end + 1
}

func metaTitle(src []byte) string {
	if loc := pdfTitleLit.FindIndex(src); loc != nil {
		v, _ := readLiteral(src, loc[1]-1)
		return strings.TrimSpace(pdfString(v))
	}
	if m := pdfTitleHex.FindSubmatch(src); m != nil {
		h := regexp.MustCompile(`[^0-9a-fA-F]`).ReplaceAll(m[1], nil)
		b, err := hex.DecodeString(string(h[:len(h)/2*2]))
		if err == nil {
			return strings.TrimSpace(pdfString(b))
		}
	}
	return ""
}

func textOps(content []byte) string {
	var sb strings.Builder
	for i := 0; i < len(content); {
		c := content[i]
		switch {
		case c == '(':
			v, end := readLiteral(content, i)
			sb.WriteString(latin1(v))
			i = end
		case c == 'T' && i+1 < len(content) && strings.IndexByte("dD*m", content[i+1]) >= 0:
			sb.WriteByte(' ')
			i += 2
		case c == 'E' && i+1 < len(content) && content[i+1] == 'T':
			sb.WriteByte('\n')
			i += 2
		default:
			if c == '-' {
				if m := pdfKern.Find(content[i:min(i+8, len(content))]); m != nil {
					sb.WriteByte(' ')
					i += len(m)
					continue
				}
			}
			i++
		}
	}
	return sb.String()
}

func extractPDF(buf []byte, pageURL *url.URL) *PdfInfo {
	if !bytes.HasPrefix(buf, []byte("%PDF-")) {
		return nil
	}
	title := metaTitle(buf[max(0, len(buf)-200_000):])
	if title == "" {
		title = metaTitle(buf[:min(len(buf), 200_000)])
	}
	var text strings.Builder
	streams := 0
	for pos := 0; text.Len() < 60_000 && streams < 400; {
		loc := pdfStream.FindIndex(buf[pos:])
		if loc == nil {
			break
		}
		start := pos + loc[1]
		endRel := bytes.Index(buf[start:], []byte("endstream"))
		if endRel < 0 {
			break
		}
		end := start + endRel
		dict := buf[max(0, pos+loc[0]-300) : pos+loc[0]]
		pos = end
		if pdfSkipDict.Match(dict) {
			continue
		}
		streams++
		var data []byte
		if bytes.Contains(dict, []byte("FlateDecode")) {
			zr, err := zlib.NewReader(bytes.NewReader(buf[start:end]))
			if err != nil {
				continue
			}
			data, _ = io.ReadAll(io.LimitReader(zr, 4<<20))
			zr.Close()
		} else if !bytes.Contains(dict, []byte("/Filter")) {
			data = buf[start:end]
		}
		if !pdfBT.Match(data) {
			continue
		}
		text.WriteString(textOps(data))
		text.WriteByte('\n')
	}

	t := text.String()
	t = strings.NewReplacer("\x02", "fi", "\x03", "fl").Replace(t)
	t = pdfCtrl.ReplaceAllString(t, "")
	t = strings.TrimSpace(pdfBlank.ReplaceAllString(pdfHSpace.ReplaceAllString(t, " "), "\n"))
	letters := len(pdfLetters.FindAllStringIndex(t, -1))
	if len([]rune(t)) < 120 || float64(letters)/float64(len([]rune(t))) < 0.55 {
		t = ""
	}
	t = cut(t, 60_000)

	fileLike := pdfFileLike.MatchString(title) && strings.ContainsAny(title, "_.")
	if len([]rune(title)) < 3 || fileLike || pdfBadTitle.MatchString(title) {
		file, _ := url.PathUnescape(path.Base(pageURL.Path))
		fromFile := strings.TrimSpace(regexp.MustCompile(`[_-]+`).ReplaceAllString(regexp.MustCompile(`(?i)\.pdf$`).ReplaceAllString(file, ""), " "))
		fromText := ""
		for _, l := range strings.Split(t, "\n") {
			if n := len([]rune(l)); n > 8 && n < 140 {
				fromText = l
				break
			}
		}
		if fromText == "" {
			fromText = cut(t, 90)
		}
		if pdfWordy.MatchString(fromFile) && !pdfShouty.MatchString(fromFile) {
			title = fromFile
		} else if fromText != "" {
			title = fromText
		} else {
			title = fromFile
		}
	}
	title = cut(clean(title), 200)
	head := cut(t, 3000)
	lang := ""
	if pdfFr.MatchString(head) {
		lang = "fr"
	} else if pdfEn.MatchString(head) {
		lang = "en"
	}
	h := sha1.Sum([]byte(title + "\n" + cut(t, 20_000)))
	return &PdfInfo{Title: title, Text: t, Lang: lang, ContentHash: hex.EncodeToString(h[:])}
}
