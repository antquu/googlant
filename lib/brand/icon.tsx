/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Icône "G" de l'application (écran d'accueil iOS / Android) : le G italique du logo sur fond noir.
 */

import { ImageResponse } from "next/og";

// Newsreader italique en WOFF : le moteur de rendu des images ne lit pas le WOFF2
async function newsreader(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch("https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@1,400&display=swap", {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.59.10 (KHTML, like Gecko) Version/5.1.9 Safari/534.59.10" },
    }).then((r) => r.text());
    const url = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype|woff)'\)/)?.[1];
    return url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** size : côté en pixels. maskable : G plus petit, Android découpe l'icône en rond ou en goutte. */
export async function brandIcon(size: number, maskable = false, headers?: Record<string, string>) {
  const font = await newsreader();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#121212",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: font ? "Newsreader" : "serif",
            fontStyle: "italic",
            fontSize: size * (maskable ? 0.56 : 0.78),
            lineHeight: 1,
            marginTop: -size * 0.04,
            marginLeft: -size * 0.02,
            color: "#f5f5f5",
          }}
        >
          G
        </div>
      </div>
    ),
    { width: size, height: size, fonts: font ? [{ name: "Newsreader", data: font, style: "italic", weight: 400 }] : undefined, headers },
  );
}
