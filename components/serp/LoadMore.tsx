"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "react";
import type { SearchHit } from "@/lib/search/types";
import { ResultItem } from "./ResultItem";

// "Charger plus" : les pages suivantes s'ajoutent sous les résultats, sans recharger
export function LoadMore({ q, startPage, pages, perPage, newTab, shown }: { q: string; startPage: number; pages: number; perPage: number; newTab: boolean; shown: string[] }) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [page, setPage] = useState(startPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [seen] = useState(() => new Set(shown));

  const more = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ q, page: String(page + 1), per: String(perPage), raw: "1" });
      const res = (await fetch(`/api/search?${params}`).then((r) => r.json())) as { hits?: SearchHit[] };
      const fresh = (res.hits ?? []).filter((h) => !seen.has(h.doc.url));
      fresh.forEach((h) => seen.add(h.doc.url));
      setHits((prev) => [...prev, ...fresh]);
      setPage((p) => p + 1);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {hits.map((hit, i) => (
        <ResultItem key={hit.doc.url} hit={hit} index={i} query={q} newTab={newTab} position={shown.length + i + 1} />
      ))}
      {page < pages && (
        <div className="load-more">
          <button type="button" className="load-more-btn" onClick={more} disabled={loading}>
            {loading ? "Chargement…" : failed ? "Réessayer" : "Charger plus de résultats"}
          </button>
        </div>
      )}
    </>
  );
}
