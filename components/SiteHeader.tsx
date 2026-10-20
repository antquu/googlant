"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

export function SiteHeader({ transparent = false, logoHidden = false }: { transparent?: boolean; logoHidden?: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > (logoHidden ? 260 : 8));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [logoHidden]);

  return (
    <header
      className="site-header"
      data-scrolled={scrolled ? "1" : undefined}
      data-transparent={transparent ? "1" : undefined}
      data-logo-hidden={logoHidden ? "1" : undefined}
    >
      <div className="container site-header-inner">
        <Logo />
        <nav className="header-nav" aria-label="Navigation principale">
          <Link href="/preferences" className="pill pill-primary pill-sm">
            Préférences
          </Link>
        </nav>
      </div>
    </header>
  );
}
