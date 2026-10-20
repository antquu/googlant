/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";

export const VERSION = "v1.0";

export function Logo({ size = "sm", href = "/", withVersion = false }: { size?: "sm" | "xl"; href?: string | null; withVersion?: boolean }) {
  const content = (
    <span className={`logo logo-${size}`}>
      <span>
        <span className="logo-g">G</span>ooglant
      </span>
      {withVersion && <span className="logo-version">{VERSION}</span>}
    </span>
  );
  if (!href) return <h1 style={{ margin: 0, fontWeight: "inherit" }}>{content}</h1>;
  return (
    <Link href={href} aria-label="Googlant — accueil" className="header-logo">
      {content}
    </Link>
  );
}
