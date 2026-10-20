"use client";

/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect } from "react";

let shown = false;

export function ConsoleBanner() {
  useEffect(() => {
    if (shown) return;
    shown = true;
    console.clear();
    console.log(`_
  __ _ _ __ | |_ __ _ _ _
 / _\` | '_ \\| __/ _\` | | | |
| (_| | | | | || (_| | |_| |
 \\__,_|_| |_|\\__\\__, |\\__,_|
                   |_|

       made by antqu • github.com/antquu`
    );
  }, []);
  return null;
}
