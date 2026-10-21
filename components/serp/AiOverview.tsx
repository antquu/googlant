"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Aperçu IA en haut des résultats, comme sur Google : la réponse s'écrit au fil de l'eau,
 * repliée au début ("Afficher plus"), avec les pages citées en petites pastilles et en cartes.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { AiSource } from "@/lib/ai/overview";
import { Favicon } from "../Favicon";

// étapes affichées pendant que la réponse se prépare
const STEPS = ["Recherche sur le web…", "Lecture des sources…", "Raisonnement…"];

function Spark() {
  return (
    <svg className="ai-spark" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <defs>
        <linearGradient id="ai-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8ab4ff" />
          <stop offset="1" stopColor="#4a7cf6" />
        </linearGradient>
      </defs>
      <path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5Z" fill="url(#ai-grad)" />
    </svg>
  );
}

// "[1][3]" ou "[1, 3]" -> une pastille : site de la première source + "+1"
function Cite({ nums, sources }: { nums: number[]; sources: AiSource[] }) {
  const list = nums.map((n) => sources.find((s) => s.n === n)).filter((s): s is AiSource => !!s);
  if (!list.length) return null;
  const first = list[0];
  return (
    <a className="ai-cite" href={first.url} target="_blank" rel="noopener" title={list.map((s) => s.title).join("\n")}>
      <Favicon src={first.favicon} host={first.host} small />
      <span>{first.host}</span>
      {list.length > 1 && <span className="ai-cite-more">+{list.length - 1}</span>}
    </a>
  );
}

function inline(text: string, sources: AiSource[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // "... Drac [1][2]." -> "... Drac. [1][2]" : la pastille vient après la ponctuation
  text = text.replace(/((?:\s*\[\d+(?:\s*,\s*\d+)*\])+)([.,;:!?])/g, "$2$1");
  const re = /\*\*(.+?)\*\*|((?:\s*\[\d+(?:\s*,\s*\d+)*\])+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<b key={`${key}b${i++}`}>{m[1]}</b>);
    else {
      const nums = [...new Set((m[2].match(/\d+/g) ?? []).map(Number))];
      out.push(" ", <Cite key={`${key}c${i++}`} nums={nums} sources={sources} />);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// petit Markdown : intertitres "## ", listes "- ", paragraphes, gras et citations
function render(text: string, sources: AiSource[]): ReactNode[] {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (!items.length) return;
    const k = `ul${blocks.length}`;
    blocks.push(
      <ul key={k}>
        {items.map((it, i) => (
          <li key={i}>{inline(it, sources, `${k}-${i}`)}</li>
        ))}
      </ul>,
    );
    items = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const li = line.match(/^[-*•]\s+(.*)/);
    if (li) {
      items.push(li[1]);
      continue;
    }
    flush();
    const h = line.match(/^#{1,4}\s+(.*)/);
    const k = `b${blocks.length}`;
    blocks.push(h ? <h3 key={k}>{h[1].replace(/\*\*/g, "")}</h3> : <p key={k}>{inline(line, sources, k)}</p>);
  }
  flush();
  return blocks;
}

export function AiOverview({ q }: { q: string }) {
  const [state, setState] = useState<"loading" | "streaming" | "done" | "none">("loading");
  const [text, setText] = useState("");
  const [sources, setSources] = useState<AiSource[]>([]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [tall, setTall] = useState(false);
  const [step, setStep] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const res = await fetch(`/api/overview?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).catch(() => null);
      if (!res?.ok || res.status === 204 || !res.body) return setState("none");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let head = true;
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) break;
        buf += value;
        if (head) {
          const nl = buf.indexOf("\n");
          if (nl < 0) continue;
          try {
            setSources((JSON.parse(buf.slice(0, nl)) as { sources: AiSource[] }).sources);
          } catch {
            return setState("none");
          }
          buf = buf.slice(nl + 1);
          head = false;
          setState("streaming");
        }
        setText(buf);
      }
      setState(buf.trim() ? "done" : "none");
    })();
    return () => ctrl.abort();
  }, [q]);

  useEffect(() => {
    if (state !== "loading") return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1100);
    return () => clearInterval(t);
  }, [state]);

  // le bouton "Afficher plus" n'apparaît que si la réponse dépasse la hauteur repliée
  useEffect(() => {
    if (body.current) setTall(body.current.scrollHeight > 250);
  }, [text]);

  if (state === "none") return null;

  const copy = async () => {
    const plain = text.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
    await navigator.clipboard?.writeText(plain).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const share = () => {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: `${q} — Googlant`, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  };
  const used = sources.filter((s) => new RegExp(`\\[(?:\\d+\\s*,\\s*)*${s.n}(?:\\s*,\\s*\\d+)*\\]`).test(text));
  const cards = used.length ? used : sources;

  return (
    <section className="ai" data-state={state} data-open={open || !tall ? "1" : undefined} aria-label="Aperçu IA" aria-busy={state !== "done"}>
      <header className="ai-head">
        <Spark />
        <span>Aperçu IA</span>
        {state === "loading" && (
          <span className="ai-status" key={step}>
            {STEPS[step]}
          </span>
        )}
      </header>

      {state === "loading" ? (
        <div className="ai-skeleton" aria-hidden>
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="ai-body" ref={body}>
          {render(text, sources)}
          {state === "streaming" && <span className="ai-caret" aria-hidden />}
        </div>
      )}

      {state !== "loading" && tall && !open && (
        <button type="button" className="ai-more" onClick={() => setOpen(true)}>
          Afficher plus <ChevronDown size={16} />
        </button>
      )}

      {(open || !tall) && state === "done" && (
        <div className="ai-foot">
          {cards.length > 0 && (
            <div className="ai-rail-wrap">
              <div className="ai-rail" ref={rail}>
                {cards.map((s) => (
                  <a key={s.n} className="ai-card" href={s.url} target="_blank" rel="noopener">
                    <span className="ai-card-site">
                      <Favicon src={s.favicon} host={s.host} small />
                      <span>{s.siteName || s.host}</span>
                    </span>
                    <span className="ai-card-main">
                      <span className="ai-card-text">
                        <b>{s.title}</b>
                        <small>
                          {s.date && <>{formatDate(s.date)} — </>}
                          {s.snippet}
                        </small>
                      </span>
                      {s.image && <img src={s.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} />}
                    </span>
                  </a>
                ))}
              </div>
              {cards.length > 2 && (
                <button type="button" className="ai-rail-next" aria-label="Sources suivantes" onClick={() => rail.current?.scrollBy({ left: 300, behavior: "smooth" })}>
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
          )}
          <p className="ai-note">Les réponses de l&apos;IA peuvent contenir des erreurs. Vérifiez les informations importantes dans les sources.</p>
          <div className="ai-actions">
            <button type="button" onClick={copy} aria-label="Copier la réponse" title="Copier">
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
            <button type="button" onClick={share} aria-label="Partager" title="Partager">
              <Share2 size={17} />
            </button>
            <button type="button" onClick={() => setVote(vote === "up" ? null : "up")} aria-pressed={vote === "up"} aria-label="Réponse utile" title="Utile">
              <ThumbsUp size={17} />
            </button>
            <button type="button" onClick={() => setVote(vote === "down" ? null : "down")} aria-pressed={vote === "down"} aria-label="Réponse pas utile" title="Pas utile">
              <ThumbsDown size={17} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
