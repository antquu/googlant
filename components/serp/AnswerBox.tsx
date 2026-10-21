/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { breadcrumb } from "@/lib/format";
import type { Answer } from "@/lib/search/answer";
import { Favicon } from "../Favicon";
import { WhyButton } from "./WhyPanel";

// réponse directe à une question, en tête des résultats (extrait d'une page, pas d'IA)
export function AnswerBox({ answer, newTab }: { answer: Answer; newTab: boolean }) {
  const { doc } = answer;
  const target = newTab ? { target: "_blank", rel: "noopener" } : {};
  return (
    <section className="answer" aria-label="Réponse">
      <p className="answer-text">
        {answer.parts.map((p, i) => (p.hit ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
      </p>
      <a href={doc.url} className="answer-source" {...target}>
        <Favicon src={doc.favicon} host={doc.host} small />
        <span>
          <span className="answer-title">{doc.title}</span>
          <span className="answer-url">{breadcrumb(doc.url)}</span>
        </span>
      </a>
      <footer className="answer-foot">
        <span className="answer-why">
          <WhyButton
            info={{
              url: doc.url,
              host: doc.host,
              title: doc.title,
              siteName: doc.siteName,
              crawledAt: doc.crawledAt,
              publishedAt: doc.publishedAt,
              lang: doc.lang,
              rank: doc.rank,
              inlinks: doc.inlinks,
              directory: doc.directory,
              score: 0,
              position: 1,
              snippet: answer.parts.map((p) => p.text).join(""),
            }}
          />
          À propos de cet extrait
        </span>
      </footer>
    </section>
  );
}
