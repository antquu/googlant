"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "react";

export function Favicon({ src, host, small = false }: { src?: string; host: string; small?: boolean }) {
  const [failed, setFailed] = useState(!src);
  const letter = host.replace(/^www\./, "").charAt(0).toUpperCase();
  return (
    <span className={`favicon ${small ? "favicon-sm" : ""}`} aria-hidden>
      {failed ? letter : <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </span>
  );
}
