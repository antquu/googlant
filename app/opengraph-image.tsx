/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ImageResponse } from "next/og";

// aperçu quand on partage un lien Googlant (iMessage, Discord, X, WhatsApp…)
export const alt = "Googlant — le web, indexé simplement";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Newsreader italique (le logo du site), en WOFF/TTF : le moteur de rendu des images ne lit pas le WOFF2
async function newsreader(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch("https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@1,300&display=swap", {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.59.10 (KHTML, like Gecko) Version/5.1.9 Safari/534.59.10" },
    }).then((r) => r.text());
    const url = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype|woff)'\)/)?.[1];
    return url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export default async function Image() {
  const font = await newsreader();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "radial-gradient(70% 90% at 12% 100%, #2a2a2a 0%, #141414 55%, #0f0f0f 100%)",
          color: "#f4f4f4",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#9a9a9a", textTransform: "uppercase" }}>Moteur de recherche indépendant</div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontFamily: font ? "Newsreader" : "serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 220,
            letterSpacing: -10,
            lineHeight: 1.1,
            backgroundImage: "linear-gradient(180deg, #ffffff 0%, #9b9b9b 100%)",
            backgroundClip: "text",
            color: "transparent",
            paddingRight: 30,
          }}
        >
          Googlant
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30, color: "#c8c8c8" }}>
          <span>Le web, indexé simplement.</span>
          <span style={{ color: "#8a8a8a" }}>Sans compte · sans pistage</span>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Newsreader", data: font, style: "italic", weight: 300 }] : undefined },
  );
}
