/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Images plus légères : les photos Wikimedia (musées, monuments...) sont souvent énormes, on demande
// leurs miniatures aux tailles standard. Les autres images restent d'origine : mesuré, un service de
// redimensionnement les ralentissait (la plupart sont déjà petites).

const WIKI_STEPS = [120, 250, 330, 500, 960, 1280, 1920];

function wikiStep(w: number): number {
  return WIKI_STEPS.find((s) => s >= w) ?? 1920;
}

export function sized(url: string | undefined | null, width: number): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    const u = new URL(url);
    if (u.hostname === "commons.wikimedia.org" && u.pathname.includes("Special:FilePath")) {
      u.searchParams.set("width", String(wikiStep(width)));
      return u.toString();
    }
    if (u.hostname === "upload.wikimedia.org") {
      // .../thumb/a/ab/Fichier.jpg/960px-Fichier.jpg -> même chose à la bonne largeur
      if (/\/\d+px-[^/]+$/.test(u.pathname)) return `${u.origin}${u.pathname.replace(/\/\d+px-([^/]+)$/, `/${wikiStep(width)}px-$1`)}`;
      return url;
    }
    return url;
  } catch {
    return url;
  }
}
