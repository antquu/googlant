/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Suspense, type ReactNode } from "react";
import { getPrefs } from "@/lib/context";
import { SerpHeader } from "@/components/serp/SerpHeader";

export default async function SearchLayout({ children }: { children: ReactNode }) {
  const prefs = await getPrefs();
  return (
    <>
      <Suspense fallback={<header className="serp-header" style={{ height: 107 }} />}>
        <SerpHeader suggestions={prefs.suggestions} />
      </Suspense>
      {children}
    </>
  );
}
