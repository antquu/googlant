/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export default function Loading() {
  return (
    <div className="container serp" aria-busy="true" aria-label="Chargement des résultats">
      <div>
        <div className="skeleton-line" style={{ width: 180, marginBottom: 28 }} />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} style={{ marginBottom: 34, opacity: 1 - i * 0.15 }}>
            <div className="skeleton-line" style={{ width: 160, height: 10, marginBottom: 12 }} />
            <div className="skeleton-line" style={{ width: "62%", height: 18, marginBottom: 12 }} />
            <div className="skeleton-line" style={{ width: "96%", marginBottom: 8 }} />
            <div className="skeleton-line" style={{ width: "80%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
