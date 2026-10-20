/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Mini speedtests de la connexion de la maison, pour que le crawler ralentisse quand la box
 * commence à saturer : latence (connexion TCP vers Cloudflare et Google) toutes les 20 s, et un
 * petit téléchargement de 1 Mo toutes les 2 min. On compare à la « normale » mesurée au calme.
 */

import { connect } from "node:net";

export interface NetHealth {
  ok: boolean;
  latencyMs: number | null;
  baselineMs: number | null;
  mbps: number | null;
  baselineMbps: number | null;
  reason?: string;
}

const PROBES: [string, number][] = [
  ["1.1.1.1", 443],
  ["8.8.8.8", 443],
];
const SPEED_URL = "http://ipv4.download.thinkbroadband.com/5MB.zip";

function tcpLatency(host: string, port: number, timeout = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const sock = connect({ host, port, family: 4 });
    const done = (v: number | null) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeout, () => done(null));
    sock.once("connect", () => done(performance.now() - t0));
    sock.once("error", () => done(null));
  });
}

async function downloadMbps(bytes = 1_000_000): Promise<number | null> {
  const t0 = performance.now();
  try {
    const res = await fetch(SPEED_URL, { headers: { Range: `bytes=0-${bytes - 1}` }, signal: AbortSignal.timeout(15_000) });
    const buf = await res.arrayBuffer();
    const s = (performance.now() - t0) / 1000;
    return buf.byteLength > 100_000 ? (buf.byteLength * 8) / 1e6 / s : null;
  } catch {
    return null;
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

export class NetMonitor {
  private latencies: number[] = [];
  private speeds: number[] = [];
  private lastSpeedAt = 0;
  health: NetHealth = { ok: true, latencyMs: null, baselineMs: null, mbps: null, baselineMbps: null };

  /** Une mesure ; à appeler toutes les ~20 s. */
  async check(): Promise<NetHealth> {
    const samples: number[] = [];
    for (const [h, p] of PROBES) {
      const v = await tcpLatency(h, p);
      if (v !== null) samples.push(v);
    }
    let mbps: number | null = this.health.mbps;
    if (Date.now() - this.lastSpeedAt > 120_000) {
      this.lastSpeedAt = Date.now();
      mbps = await downloadMbps();
      if (mbps !== null) this.speeds.push(mbps);
      if (this.speeds.length > 30) this.speeds.shift();
    }

    const latencyMs = samples.length ? Math.min(...samples) : null;
    if (latencyMs !== null) this.latencies.push(latencyMs);
    if (this.latencies.length > 90) this.latencies.shift();

    // « normale » : les meilleures mesures récentes (la connexion au calme)
    const sortedL = [...this.latencies].sort((a, b) => a - b);
    const baselineMs = sortedL.length ? sortedL[Math.floor(sortedL.length * 0.1)] : null;
    const sortedS = [...this.speeds].sort((a, b) => b - a);
    const baselineMbps = sortedS.length ? sortedS[Math.floor(sortedS.length * 0.1)] : null;

    let ok = true;
    let reason: string | undefined;
    if (latencyMs === null) {
      ok = false;
      reason = "Cloudflare et Google ne répondent plus";
    } else if (baselineMs !== null && this.latencies.length >= 3) {
      const recent = median(this.latencies.slice(-3));
      if (recent > baselineMs * 4 + 40) {
        ok = false;
        reason = `latence ${Math.round(recent)} ms (normale ${Math.round(baselineMs)} ms)`;
      }
    }
    if (ok && mbps !== null && baselineMbps !== null && this.speeds.length >= 2 && mbps < baselineMbps * 0.3) {
      ok = false;
      reason = `débit ${mbps.toFixed(1)} Mbit/s (normal ${baselineMbps.toFixed(1)} Mbit/s)`;
    }
    this.health = { ok, latencyMs, baselineMs, mbps, baselineMbps, reason };
    return this.health;
  }
}
