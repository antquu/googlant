"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState, type ImgHTMLAttributes } from "react";
import { sized } from "@/lib/img";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string;
  /** largeur affichée en pixels CSS (la miniature est demandée en ×2 pour les écrans retina) */
  width: number;
  onFail?: () => void;
};

// miniature légère d'abord ; si elle échoue (site qui bloque le redimensionnement), l'original
export function FastImg({ src, width, onFail, loading = "lazy", ...rest }: Props) {
  const light = sized(src, width * 2);
  const [current, setCurrent] = useState(light || src);
  return (
    <img
      {...rest}
      src={current}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (current !== src) setCurrent(src);
        else onFail?.();
      }}
    />
  );
}
