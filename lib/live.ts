"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useState } from "react";

// une seule connexion par onglet, partagée par le footer, la ligne « en direct » de l'accueil, etc.
// Si NEXT_PUBLIC_LIVE_URL est défini (site sur Vercel), le navigateur se branche directement sur
// le serveur d'index : Vercel ne sert aucune de ces requêtes.

export interface LiveStats {
  docs: number;
  hosts: number;
  images?: number;
  queued: number;
  crawlerAt: number | null;
  pagesPerMinute: number;
  builtAt?: string;
}

export interface LiveItem {
  id: number;
  title: string;
  host: string;
  url: string;
  crawledAt: string;
}

export interface LivePayload {
  stats: LiveStats;
  items: LiveItem[];
}

const BASE = (process.env.NEXT_PUBLIC_LIVE_URL ?? "").replace(/\/$/, "");

let current: LivePayload | null = null;
const listeners = new Set<(p: LivePayload) => void>();
let source: EventSource | null = null;
let poll: ReturnType<typeof setInterval> | null = null;
let failures = 0;

function publish(p: LivePayload) {
  if (!p?.stats) return;
  current = { stats: p.stats, items: p.items?.length ? p.items : (current?.items ?? []) };
  for (const l of listeners) l(current);
}

async function pollOnce() {
  if (document.hidden) return;
  try {
    publish((await fetch(`${BASE}/api/live`, { cache: "no-store" }).then((r) => r.json())) as LivePayload);
  } catch {
    /* serveur d'index injoignable : on garde les derniers chiffres */
  }
}

function startPolling() {
  if (poll) return;
  void pollOnce();
  poll = setInterval(pollOnce, 15_000);
}

function connect() {
  if (source || poll || typeof EventSource === "undefined") return startPolling();
  source = new EventSource(`${BASE}/api/live/stream`);
  source.onmessage = (e) => {
    failures = 0;
    try {
      publish(JSON.parse(e.data) as LivePayload);
    } catch {
      /* message incomplet */
    }
  };
  source.onerror = () => {
    // pas de flux disponible (ex. pas de serveur d'index) : on passe en sondage toutes les 15 s
    if (++failures >= 3 || source?.readyState === EventSource.CLOSED) {
      disconnect();
      startPolling();
    }
  };
}

function disconnect() {
  source?.close();
  source = null;
  if (poll) clearInterval(poll);
  poll = null;
}

function onVisibility() {
  if (document.hidden) disconnect();
  else if (listeners.size) {
    failures = 0;
    connect();
  }
}

export function useLive(initial: LivePayload | null): LivePayload | null {
  const [data, setData] = useState<LivePayload | null>(current ?? initial);
  useEffect(() => {
    listeners.add(setData);
    if (current) setData(current);
    if (listeners.size === 1) {
      document.addEventListener("visibilitychange", onVisibility);
      if (!document.hidden) connect();
    }
    return () => {
      listeners.delete(setData);
      if (!listeners.size) {
        document.removeEventListener("visibilitychange", onVisibility);
        disconnect();
      }
    };
  }, []);
  return data;
}
