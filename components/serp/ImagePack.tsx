"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { useState } from "react";
import { FastImg } from "../FastImg";
import { ArrowRightIcon } from "../icons";

export interface PackImage {
  src: string;
  alt: string;
  pageUrl: string;
  host: string;
}

// quelques images au milieu des résultats "Tout", comme Google
export function ImagePack({ images, moreHref, newTab }: { images: PackImage[]; moreHref: string; newTab: boolean }) {
  const [broken, setBroken] = useState<string[]>([]);
  const visible = images.filter((i) => !broken.includes(i.src)).slice(0, 6);
  if (visible.length < 3) return null;
  return (
    <section className="image-pack" aria-label="Images">
      <div className="image-pack-head">
        <h2>Images</h2>
        <Link prefetch={false} href={moreHref}>
          Voir toutes les images <ArrowRightIcon />
        </Link>
      </div>
      <div className="image-pack-row">
        {visible.map((img) => (
          <a key={img.src} href={img.pageUrl} title={img.alt || img.host} {...(newTab ? { target: "_blank", rel: "noopener" } : {})}>
            <FastImg src={img.src} width={130} alt={img.alt} onFail={() => setBroken((b) => [...b, img.src])} />
            <span>{img.host.replace(/^www\./, "")}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
