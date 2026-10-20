"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState, type FormEvent } from "react";
import { ArrowRightIcon } from "../icons";

const EXAMPLES = ["grelines.fr", "lequipe.fr", "arte.tv"];

type State = { kind: "idle" } | { kind: "sending" } | { kind: "ok"; text: string } | { kind: "error"; text: string };

export function SubmitSite() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const send = async (value: string) => {
    if (!value.trim() || state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }) });
      const data = (await res.json()) as { ok: boolean; host?: string; status?: string; ahead?: number; error?: string };
      if (!data.ok) return setState({ kind: "error", text: data.error ?? "Impossible d'ajouter ce site." });
      const wait = data.ahead ? `${data.ahead} site${data.ahead > 1 ? "s" : ""} avant lui` : "il passe en premier";
      setState({
        kind: "ok",
        text: data.status === "refresh" ? `${data.host} est déjà indexé : GooglantBot repasse dessus en priorité (${wait}).` : `${data.host} est dans la file prioritaire : ${wait}, visite dans environ une minute.`,
      });
      setUrl("");
    } catch {
      setState({ kind: "error", text: "Le crawler est injoignable pour le moment." });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(url);
  };

  return (
    <section className="submit-site" aria-labelledby="submit-title">
      <svg className="submit-rings" viewBox="0 0 1600 360" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <ellipse key={i} cx="800" cy="180" rx={340 + i * 80} ry={150 + i * 70} />
        ))}
        <circle className="submit-spark" cx="1350" cy="70" r="1.6" />
        <circle className="submit-spark" cx="955" cy="105" r="1.2" style={{ animationDelay: "1.2s" }} />
        <circle className="submit-spark" cx="300" cy="250" r="1.4" style={{ animationDelay: "2.4s" }} />
      </svg>

      <h2 id="submit-title">Un site manque ?</h2>
      <p className="submit-sub">Proposez une adresse : GooglantBot la visite en priorité. Gratuit, sans compte.</p>

      <form className="submit-field" data-filled={url.trim() ? "1" : undefined} onSubmit={onSubmit}>
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (state.kind !== "sending") setState({ kind: "idle" });
          }}
          placeholder="monsite.fr"
          aria-label="Adresse du site à indexer"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" aria-label="Proposer ce site" disabled={!url.trim() || state.kind === "sending"}>
          <ArrowRightIcon />
        </button>
      </form>

      {state.kind === "ok" || state.kind === "error" ? (
        <p className={`submit-status ${state.kind === "ok" ? "is-ok" : "is-error"}`} role="status">
          {state.text}
        </p>
      ) : (
        <p className="submit-try">
          <span>Essayer</span>
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              {i > 0 && <span className="submit-dot">·</span>}
              <button type="button" onClick={() => setUrl(ex)}>
                {ex}
              </button>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
