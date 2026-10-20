"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { GlobeIcon, ImageIcon, NewsIcon, MapIcon, SettingsIcon } from "../icons";
import { Logo } from "../Logo";
import { SearchComposer } from "../SearchComposer";
import { SearchTools, ToolsButton, hasOperators } from "./SearchTools";

const TABS = [
  { id: "all", label: "Tout", Icon: GlobeIcon },
  { id: "images", label: "Images", Icon: ImageIcon },
  { id: "maps", label: "Maps", Icon: MapIcon },
  { id: "news", label: "Actualités", Icon: NewsIcon },
] as const;

export function SerpHeader({ suggestions }: { suggestions: boolean }) {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab")! : "all";
  const tabHref = (id: string) =>
    id === "maps" ? `/maps?q=${encodeURIComponent(q)}` : `/search?q=${encodeURIComponent(q)}${id === "all" ? "" : `&tab=${id}`}`;
  const [tools, setTools] = useState(hasOperators(q));
  const toolsTab = tab === "all" || tab === "news";

  return (
    <header className="serp-header">
      <div className="container serp-header-row">
        <Logo />
        <SearchComposer defaultValue={q} compact tab={tab} suggestions={suggestions} />
        <nav className="header-nav">
          <Link href="/preferences" className="icon-btn" aria-label="Préférences">
            <SettingsIcon />
          </Link>
        </nav>
      </div>
      <div className="container">
        <nav className="serp-tabs" aria-label="Type de résultats">
          {TABS.map(({ id, label, Icon }) => (
            <Link key={id} href={tabHref(id)} className="serp-tab" aria-current={tab === id ? "page" : undefined}>
              <Icon /> {label}
            </Link>
          ))}
          {toolsTab && <ToolsButton open={tools} onToggle={() => setTools((o) => !o)} />}
        </nav>
        {toolsTab && tools && <SearchTools key={q} q={q} tab={tab} />}
      </div>
    </header>
  );
}
