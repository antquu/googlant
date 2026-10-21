"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Aperçu IA en haut des résultats, comme sur Google : la réponse s'écrit au fil de l'eau,
 * repliée au début ("Afficher plus"), avec les pages citées en petites pastilles et en cartes,
 * puis l'encadré "Autres questions". Le texte arrive avec la page (promesse par morceau).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { AiPart, AiSource } from "@/lib/ai/overview";
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

// fin de la réponse : "QUESTIONS:" puis "? question | réponse [n]" pour l'encadré "Autres questions"
function split(full: string): { main: string; questions: { q: string; a: string }[] } {
  const at = full.search(/\n\s*QUESTIONS\s*:/i);
  // pendant l'écriture, on cache aussi un "QUEST" pas encore terminé
  const main = (at < 0 ? full : full.slice(0, at)).replace(/\n\s*Q[A-Z]{0,8}\s*:?\s*$/i, "");
  const questions = (at < 0 ? "" : full.slice(at))
    .split("\n")
    .map((l) => l.trim().match(/^\?\s*(.+?)\s*\|\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ q: m[1], a: m[2] }))
    .slice(0, 4);
  return { main, questions };
}

function Questions({ items, sources }: { items: { q: string; a: string }[]; sources: AiSource[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="paa" aria-label="Autres questions">
      <h2>Autres questions</h2>
      {items.map((it, i) => (
        <div key={i} className="paa-item" data-open={open === i ? "1" : undefined}>
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span>{it.q}</span>
            <i>
              <ChevronDown size={18} />
            </i>
          </button>
          {open === i && <p>{inline(it.a, sources, `paa${i}`)}</p>}
        </div>
      ))}
    </section>
  );
}

export function AiOverview({ q, sources, first }: { q: string; sources: AiSource[]; first: Promise<AiPart> }) {
  const [state, setState] = useState<"loading" | "streaming" | "done" | "none">("loading");
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [tall, setTall] = useState(false);
  const [step, setStep] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    // rien reçu à temps : on retire l'encart plutôt que de rester sur "Raisonnement…"
    const late = setTimeout(() => {
      alive = false;
      setState((s) => (s === "loading" ? "none" : s));
    }, 35_000);
    (async () => {
      let part = await first.catch(() => null);
      if (!alive) return;
      clearTimeout(late);
      if (!part) return setState("none");
      setState("streaming");
      let buf = "";
      while (part && alive) {
        buf += part.text;
        setText(buf);
        part = await part.next.catch(() => null);
      }
      if (alive) setState(split(buf).main.trim() ? "done" : "none");
    })();
    return () => {
      alive = false;
      clearTimeout(late);
    };
  }, [first]);

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
  const { main, questions } = split(text);

  const copy = async () => {
    const plain = main.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
    await navigator.clipboard?.writeText(plain).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const share = () => {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: `${q} — Googlant`, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  };
  const used = sources.filter((s) => new RegExp(`\\[(?:\\d+\\s*,\\s*)*${s.n}(?:\\s*,\\s*\\d+)*\\]`).test(main));
  const cards = used.length ? used : sources;

  return (
    <>
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
            {render(main, sources)}
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
      {state === "done" && questions.length > 0 && <Questions items={questions} sources={sources} />}
    </>
  );
}
