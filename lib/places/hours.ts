/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const FR: Record<string, string> = { Mo: "lun.", Tu: "mar.", We: "mer.", Th: "jeu.", Fr: "ven.", Sa: "sam.", Su: "dim.", PH: "fériés", off: "fermé" };

type Schedule = ([number, number][] | null)[];

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/);
    if (!m) return null;
    const start = +m[1] * 60 + +m[2];
    let end = +m[3] * 60 + +m[4];
    if (end <= start) end += 24 * 60;
    out.push([start, end]);
  }
  return out;
}

export function parseOpeningHours(raw: string): Schedule | null {
  const s = raw.trim();
  if (s === "24/7") return Array.from({ length: 7 }, () => [[0, 24 * 60]]);
  const schedule: Schedule = Array.from({ length: 7 }, () => null);
  for (const rule of s.split(";").map((r) => r.trim()).filter(Boolean)) {
    if (/^(PH|SH|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|easter|\d{4})\b/i.test(rule)) continue;
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*(.*)$/);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/,$/, "")) : [0, 1, 2, 3, 4, 5, 6];
    const rest = m[2].replace(/,?\s*PH\b.*$/, "").trim();
    if (!days) return null;
    const times = rest === "off" || rest === "closed" ? [] : parseTimes(rest);
    if (!times) return null;
    for (const d of days) schedule[d] = times;
  }
  return schedule;
}

const hhmm = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export interface OpenStatus {
  open: boolean;
  label: string;
}

export function openStatus(raw: string | undefined, now = new Date()): OpenStatus | null {
  if (!raw) return null;
  const sched = parseOpeningHours(raw);
  if (!sched) return null;
  const day = now.getDay();
  const min = now.getHours() * 60 + now.getMinutes();

  for (const [a, b] of sched[(day + 6) % 7] ?? []) if (b > 1440 && min < b - 1440) return { open: true, label: `Ouvert · ferme à ${hhmm(b)}` };

  const today = sched[day] ?? [];
  for (const [a, b] of today) {
    if (min >= a && min < b) return { open: true, label: b - a >= 1440 ? "Ouvert 24 h/24" : `Ouvert · ferme à ${hhmm(b)}` };
  }
  const later = today.find(([a]) => a > min);
  if (later) return { open: false, label: `Fermé · ouvre à ${hhmm(later[0])}` };
  for (let i = 1; i <= 7; i++) {
    const next = sched[(day + i) % 7];
    if (next && next.length) {
      const when = i === 1 ? "demain" : FR[DAYS[(day + i) % 7]];
      return { open: false, label: `Fermé · ouvre ${when} à ${hhmm(next[0][0])}` };
    }
  }
  return { open: false, label: "Fermé" };
}

const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function weeklyHours(raw: string | undefined): { day: string; text: string; today: boolean }[] | null {
  if (!raw) return null;
  const sched = parseOpeningHours(raw);
  if (!sched) return null;
  const today = new Date().getDay();
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    day: DAY_NAMES[d],
    today: d === today,
    text: sched[d]?.length ? sched[d]!.map(([a, b]) => (b - a >= 1440 ? "Ouvert 24 h/24" : `${hhmm(a)}–${hhmm(b)}`)).join(", ") : "Fermé",
  }));
}

export function formatHours(raw: string): string {
  return raw.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|off)\b/g, (m) => FR[m] ?? m).replace(/;\s*/g, " · ");
}
