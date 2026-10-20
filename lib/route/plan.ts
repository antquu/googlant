/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "server-only";

const MOBILITES_M = "https://data.mobilites-m.fr/api/routers/default/plan";
const TRANSITOUS = "https://api.transitous.org/api/v5/plan";
const GRENOBLE_AREA = { south: 44.95, north: 45.4, west: 5.45, east: 6.1 };
const UA = "Googlant/1.0 (github.com/antquu)";

export interface Point {
  lat: number;
  lon: number;
  name: string;
}

export interface Leg {
  mode: string;
  from: Point;
  to: Point;
  start: number;
  end: number;
  duration: number;
  distance: number;
  line?: { short: string; long?: string; color: string; text: string; headsign?: string; agency?: string };
  stops: number;
  geometry: [number, number][];
}

export interface Itinerary {
  start: number;
  end: number;
  duration: number;
  walk: number;
  transfers: number;
  legs: Leg[];
}

export interface PlanOptions {
  when?: Date;
  arriveBy?: boolean;
  modes?: string[];
  wheelchair?: boolean;
  lessWalk?: boolean;
}

const ALL_MODES = ["TRAM", "SUBWAY", "BUS", "RAIL"];

export interface PlanResult {
  itineraries: Itinerary[];
  engine: "mobilites-m" | "transitous";
}

const inGrenoble = (p: { lat: number; lon: number }) =>
  p.lat >= GRENOBLE_AREA.south && p.lat <= GRENOBLE_AREA.north && p.lon >= GRENOBLE_AREA.west && p.lon <= GRENOBLE_AREA.east;

function decode(encoded: string, precision: number): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lon += delta;
    }
    out.push([lon / factor, lat / factor]);
  }
  return out;
}

const MODE: Record<string, string> = {
  METRO: "SUBWAY",
  HIGHSPEED_RAIL: "RAIL",
  LONG_DISTANCE: "RAIL",
  NIGHT_RAIL: "RAIL",
  REGIONAL_RAIL: "RAIL",
  REGIONAL_FAST_RAIL: "RAIL",
  COACH: "BUS",
  AERIAL_LIFT: "GONDOLA",
  BIKE: "BICYCLE",
};

const DEFAULT_COLOR: Record<string, string> = { TRAM: "#3376B8", SUBWAY: "#E2001A", BUS: "#6B7280", RAIL: "#0069B4", FERRY: "#0EA5E9", GONDOLA: "#8B5CF6", FUNICULAR: "#8B5CF6" };

const color = (c: string | undefined, mode: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : DEFAULT_COLOR[mode] ?? "#9CA3AF");

interface RawPlace {
  name?: string;
  lat: number;
  lon: number;
}
interface RawLeg {
  mode: string;
  from: RawPlace;
  to: RawPlace;
  startTime: number | string;
  endTime: number | string;
  duration: number;
  distance?: number;
  routeShortName?: string;
  route?: string;
  routeLongName?: string;
  routeColor?: string;
  routeTextColor?: string;
  headsign?: string;
  agencyName?: string;
  displayName?: string;
  intermediateStops?: unknown[];
  legGeometry?: { points: string; precision?: number };
}

function normalize(raw: { duration: number; startTime: number | string; endTime: number | string; legs: RawLeg[] }, from: Point, to: Point, precision: number): Itinerary {
  const ms = (t: number | string) => (typeof t === "number" ? t : new Date(t).getTime());
  const legs: Leg[] = raw.legs.map((l) => {
    const mode = MODE[l.mode] ?? l.mode;
    const transit = !["WALK", "BICYCLE", "CAR"].includes(mode);
    const place = (p: RawPlace, fallback: Point): Point => ({ lat: p.lat, lon: p.lon, name: !p.name || p.name === "START" || p.name === "END" || p.name === "Origin" || p.name === "Destination" ? fallback.name : p.name });
    const short = (l.routeShortName || l.route || l.displayName || "").replace(/^SEM:/, "").trim();
    return {
      mode,
      from: place(l.from, from),
      to: place(l.to, to),
      start: ms(l.startTime),
      end: ms(l.endTime),
      duration: Math.round(l.duration),
      distance: Math.round(l.distance ?? 0),
      line: transit
        ? { short: short || mode, long: l.routeLongName?.replace(/^(REF|COM)~[^~]*~[^~]*~/i, ""), color: color(l.routeColor, mode), text: l.routeTextColor && /^[0-9a-f]{6}$/i.test(l.routeTextColor) ? `#${l.routeTextColor}` : "#ffffff", headsign: l.headsign, agency: l.agencyName }
        : undefined,
      stops: (l.intermediateStops?.length ?? 0) + (transit ? 1 : 0),
      geometry: l.legGeometry?.points ? decode(l.legGeometry.points, l.legGeometry.precision ?? precision) : [[l.from.lon, l.from.lat], [l.to.lon, l.to.lat]],
    };
  });
  const transitLegs = legs.filter((l) => l.line);
  return {
    start: ms(raw.startTime),
    end: ms(raw.endTime),
    duration: Math.round(raw.duration),
    walk: legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.duration, 0),
    transfers: Math.max(0, transitLegs.length - 1),
    legs,
  };
}

async function mobilitesM(from: Point, to: Point, when: Date, arriveBy: boolean, o: PlanOptions): Promise<Itinerary[]> {
  const modes = o.modes?.length ? o.modes : ALL_MODES;
  const pad = (n: number) => String(n).padStart(2, "0");
  const params = new URLSearchParams({
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${to.lat},${to.lon}`,
    arriveBy: arriveBy ? "true" : "false",
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
    routerId: "default",
    optimize: "QUICK",
    walkReluctance: o.lessWalk ? "12" : "5",
    locale: "fr",
    mode: modes.length === ALL_MODES.length ? "WALK,TRANSIT" : `WALK,${modes.join(",")}`,
    wheelchair: o.wheelchair ? "true" : "false",
    showIntermediateStops: "true",
    minTransferTime: "20",
    transferPenalty: "60",
    walkBoardCost: "300",
    walkSpeed: "1.4",
    numItineraries: "5",
  });
  const res = await fetch(`${MOBILITES_M}?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Mobilités M ${res.status}`);
  const data = (await res.json()) as { plan?: { itineraries?: { duration: number; startTime: number; endTime: number; legs: RawLeg[] }[] } };
  return (data.plan?.itineraries ?? []).map((it) => normalize(it, from, to, 5));
}

async function transitous(from: Point, to: Point, when: Date, arriveBy: boolean, o: PlanOptions): Promise<Itinerary[]> {
  const modes = o.modes?.length ? o.modes : ALL_MODES;
  const params = new URLSearchParams({
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${to.lat},${to.lon}`,
    time: when.toISOString(),
    arriveBy: arriveBy ? "true" : "false",
    numItineraries: "6",
    detailedTransfers: "false",
    transitModes: modes.length === ALL_MODES.length ? "TRAM,SUBWAY,BUS,RAIL,FERRY,FUNICULAR,AERIAL_LIFT" : modes.join(","),
  });
  if (o.wheelchair) params.set("pedestrianProfile", "WHEELCHAIR");
  if (o.lessWalk) {
    params.set("maxPreTransitTime", "600");
    params.set("maxPostTransitTime", "600");
  }
  const res = await fetch(`${TRANSITOUS}?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Transitous ${res.status}`);
  const data = (await res.json()) as { itineraries?: { duration: number; startTime: string; endTime: string; legs: RawLeg[] }[] };
  return (data.itineraries ?? [])
    .filter((it) => !it.legs.some((l) => /\b(flixbus|blablacar)\b/i.test(l.agencyName ?? "")))
    .map((it) => normalize(it, from, to, 6))
    .sort((a, b) => a.start - b.start);
}

export async function planTrip(from: Point, to: Point, opts: PlanOptions = {}): Promise<PlanResult> {
  const when = opts.when ?? new Date();
  const arriveBy = !!opts.arriveBy;
  if (inGrenoble(from) && inGrenoble(to)) {
    try {
      const its = await mobilitesM(from, to, when, arriveBy, opts);
      if (its.length) return { itineraries: its, engine: "mobilites-m" };
    } catch {
      // repli sur Transitous
    }
  }
  return { itineraries: await transitous(from, to, when, arriveBy, opts), engine: "transitous" };
}
