/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  const windowSize = 10;
  const start = Math.max(1, Math.min(page - 4, pages - windowSize + 1));
  const end = Math.min(pages, start + windowSize - 1);
  const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav className="pager" aria-label="Pages de résultats">
      <div className="pager-word">
        <span aria-hidden>G</span>
        {nums.map((n) =>
          n === page ? (
            <span key={n} className="pager-o" aria-current="page" aria-label={`Page ${n}`}>
              o<small>{n}</small>
            </span>
          ) : (
            <Link prefetch={false} key={n} href={href(n)} className="pager-o" aria-label={`Page ${n}`}>
              o<small>{n}</small>
            </Link>
          ),
        )}
        <span aria-hidden>glant</span>
      </div>
      <div className="pager-arrows">
        {page > 1 && (
          <Link prefetch={false} href={href(page - 1)} className="pill pill-outlined pill-sm">
            <ChevronLeftIcon /> Précédent
          </Link>
        )}
        {page < pages && (
          <Link prefetch={false} href={href(page + 1)} className="pill pill-outlined pill-sm">
            Suivant <ChevronRightIcon />
          </Link>
        )}
      </div>
    </nav>
  );
}
