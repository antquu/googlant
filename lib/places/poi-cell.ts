/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// découpe la France en cases d'environ 55 × 40 km, indexées comme des mots pour filtrer par zone dans FTS5
export const poiCell = (lat: number, lon: number) => `c${Math.floor(lat * 2)}x${Math.floor(lon * 2) + 100}`;

export function cellsAround(lat: number, lon: number): string[] {
  const cells: string[] = [];
  for (const dy of [-0.5, 0, 0.5]) for (const dx of [-0.5, 0, 0.5]) cells.push(poiCell(lat + dy, lon + dx));
  return cells;
}
