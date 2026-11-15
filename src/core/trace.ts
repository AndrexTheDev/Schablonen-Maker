/**
 * Vektorisierung: Binärmaske -> geschlossene Polygone (SVG-Pfade).
 *
 * Verfahren: Kantenverfolgung auf dem Pixelgitter. Jede Kante trennt
 * Material (1) von Öffnung (0); an jedem Gitterpunkt werden die Kanten
 * nach der 4-Nachbar-Konfiguration gepaart (Sattelfälle werden
 * aufgelöst). Dadurch ist die Topologie exakt – keine Löcher gehen
 * verloren, keine Doppelkanten. Danach Douglas-Peucker + optional
 * Chaikin-Glättung.
 */

import type { Contour } from './types';

const DX = [0, 1, 0, -1]; // 0=N 1=E 2=S 3=W
const DY = [-1, 0, 1, 0];
const OPP = [2, 3, 0, 1];

export interface TraceOptions {
  /** Douglas-Peucker Toleranz in Pixeln (0 = keine Vereinfachung) */
  tolerance?: number;
  /** Chaikin-Iterationen (0..2) */
  smooth?: number;
  /** Konturen unter dieser Fläche (px²) verwerfen */
  minArea?: number;
}

export function traceContours(mask: Uint8Array, w: number, h: number, opts: TraceOptions = {}): Contour[] {
  const tol = opts.tolerance ?? 0.6;
  const smoothIters = Math.max(0, Math.min(2, opts.smooth ?? 0));
  const minArea = opts.minArea ?? 0.5;
  const vw = w + 1;
  const vh = h + 1;
  const visited = new Uint8Array(vw * vh);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  const hasEdge = (x: number, y: number, d: number) => {
    const nw = at(x - 1, y - 1);
    const ne = at(x, y - 1);
    const sw = at(x - 1, y);
    const se = at(x, y);
    switch (d) {
      case 0: // N: vertikal über dem Punkt, trennt NW/NE
        return nw !== ne;
      case 2: // S: vertikal unter dem Punkt, trennt SW/SE
        return sw !== se;
      case 3: // W: horizontal links, trennt NW/SW
        return nw !== sw;
      default: // E: horizontal rechts, trennt NE/SE
        return ne !== se;
    }
  };
  /** Nachfolgekante an einem Gitterpunkt. */
  const pair = (x: number, y: number, inEdge: number): number => {
    const nw = at(x - 1, y - 1);
    const ne = at(x, y - 1);
    const sw = at(x - 1, y);
    const se = at(x, y);
    const n = nw + ne + sw + se;
    if (n === 0 || n === 4) return -1;
    if (n === 1) {
      if (nw) return inEdge === 0 ? 3 : 0;
      if (ne) return inEdge === 0 ? 1 : 0;
      if (sw) return inEdge === 2 ? 3 : 2;
      return inEdge === 2 ? 1 : 2;
    }
    if (n === 3) {
      if (!nw) return inEdge === 0 ? 3 : 0;
      if (!ne) return inEdge === 0 ? 1 : 0;
      if (!sw) return inEdge === 2 ? 3 : 2;
      return inEdge === 2 ? 1 : 2;
    }
    // n === 2
    if (nw && se) {
      // Sattel: Material diagonal NW/SE
      if (inEdge === 0) return 3;
      if (inEdge === 3) return 0;
      if (inEdge === 2) return 1;
      return 2;
    }
    if (ne && sw) {
      if (inEdge === 0) return 1;
      if (inEdge === 1) return 0;
      if (inEdge === 2) return 3;
      return 2;
    }
    if (nw && ne) return inEdge === 3 ? 1 : 3; // Oberkante
    if (sw && se) return inEdge === 3 ? 1 : 3; // Unterkante
    if (nw && sw) return inEdge === 0 ? 2 : 0; // linke Spalte
    return inEdge === 0 ? 2 : 0; // rechte Spalte
  };

  const contours: Contour[] = [];
  const maxSteps = 8 * (w * h + 4 * (w + h)) + 16;

  for (let y = 0; y < vh; y++) {
    for (let x = 0; x < vw; x++) {
      // Schneller Vorab-Test: an Punkten, an denen alle vier Nachbarpixel
      // gleich sind, liegt keine Kante.
      const nw = at(x - 1, y - 1);
      const ne = at(x, y - 1);
      const sw = at(x - 1, y);
      const se = at(x, y);
      const sum = nw + ne + sw + se;
      if (sum === 0 || sum === 4) continue;
      const edges = [nw !== ne, ne !== se, sw !== se, nw !== sw]; // N,E,S,W
      // Ohne diese Regel läuft jede Kontur zweimal durch (einmal in jeder
      // Richtung) und hebt sich beim Füllen mit evenodd selbst auf.
      // Material muss beim Start links der Laufrichtung liegen (N->West,
      // E->Nord, S->Ost, W->Süd). Damit läuft jede Kontur genau einmal.
      const starts = [nw === 1 && ne === 0, ne === 1 && se === 0, se === 1 && sw === 0, sw === 1 && nw === 0];
      const vidx = y * vw + x;
      for (let d = 0; d < 4; d++) {
        if (!edges[d] || !starts[d]) continue;
        if (visited[vidx] & (1 << d)) continue;
        // Schleife verfolgen
        const pts: number[] = [];
        let cx = x;
        let cy = y;
        let dir = d;
        let steps = 0;
        const startX = x;
        const startY = y;
        const startDir = d;
        let ok = false;
        while (steps++ < maxSteps) {
          visited[cy * vw + cx] |= 1 << dir;
          pts.push(cx, cy);
          cx += DX[dir];
          cy += DY[dir];
          const inEdge = OPP[dir];
          const nd = pair(cx, cy, inEdge);
          if (nd < 0) break;
          dir = nd;
          if (cx === startX && cy === startY && dir === startDir) {
            ok = true;
            break;
          }
        }
        if (!ok || pts.length < 8) continue;
        const poly = finishLoop(pts, tol, smoothIters);
        if (!poly) continue;
        const { pts: p, area } = poly;
        if (Math.abs(area) < minArea) continue;
        contours.push({ pts: p, area, hole: area > 0 });
      }
    }
  }
  return contours;
}

function finishLoop(pts: number[], tol: number, smoothIters: number): { pts: number[]; area: number } | null {
  const n = pts.length / 2;
  if (n < 3) return null;
  // Startpunkt auf eine stabile Ecke legen (kleinstes x, dann y),
  // damit Douglas-Peucker die geschlossene Kontur nicht aufschneidet.
  let start = 0;
  for (let i = 1; i < n; i++) {
    const xi = pts[i * 2];
    const yi = pts[i * 2 + 1];
    const xb = pts[start * 2];
    const yb = pts[start * 2 + 1];
    if (xi < xb || (xi === xb && yi < yb)) start = i;
  }
  const rotated = new Float64Array(n * 2 + 2);
  for (let i = 0; i <= n; i++) {
    const src = (start + i) % n;
    rotated[i * 2] = pts[src * 2];
    rotated[i * 2 + 1] = pts[src * 2 + 1];
  }
  let closed = Array.from(rotated);
  if (tol > 0) {
    const keep = rdp(closed, tol);
    if (keep.length >= 8) closed = keep;
  }
  // letzter Punkt == erster -> entfernen
  const open = closed.slice(0, closed.length - 2);
  let result = open;
  for (let s = 0; s < smoothIters; s++) result = chaikin(result);
  const area = signedArea(result);
  return { pts: result, area };
}

function rdp(points: number[], tolerance: number): number[] {
  const n = points.length / 2;
  if (n < 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;
    const x1 = points[first * 2];
    const y1 = points[first * 2 + 1];
    const x2 = points[last * 2];
    const y2 = points[last * 2 + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let maxI = -1;
    for (let i = first + 1; i < last; i++) {
      const px = points[i * 2];
      const py = points[i * 2 + 1];
      let d2: number;
      if (len2 === 0) {
        d2 = (px - x1) * (px - x1) + (py - y1) * (py - y1);
      } else {
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const qx = x1 + t * dx;
        const qy = y1 + t * dy;
        d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
      }
      if (d2 > maxD) {
        maxD = d2;
        maxI = i;
      }
    }
    if (maxD > tol2 && maxI > 0) {
      keep[maxI] = 1;
      stack.push([first, maxI], [maxI, last]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) {
      out.push(points[i * 2], points[i * 2 + 1]);
    }
  }
  return out;
}

/**
 * Chaikin-Glättung mit begrenzter Eckenkürzung.
 *
 * Klassisches Chaikin kürzt jede Ecke um ein Viertel der angrenzenden
 * Kantenlänge. Nach der Douglas-Peucker-Vereinfachung sind die Kanten lang,
 * aus dem rechteckigen Schablonenrand würde also ein Achteck. Deshalb wird
 * die Kürzung auf maxCut Pixel begrenzt – Treppchen verschwinden, Ecken
 * bleiben stehen.
 */
function chaikin(points: number[], maxCut = 2.5): number[] {
  const n = points.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = points[i * 2];
    const y0 = points[i * 2 + 1];
    const j = (i + 1) % n;
    const k = (i - 1 + n) % n;
    const x1 = points[j * 2];
    const y1 = points[j * 2 + 1];
    const xp = points[k * 2];
    const yp = points[k * 2 + 1];
    const lenPrev = Math.hypot(x0 - xp, y0 - yp) || 1;
    const lenNext = Math.hypot(x1 - x0, y1 - y0) || 1;
    const tp = Math.min(0.25, maxCut / lenPrev);
    const tn = Math.min(0.25, maxCut / lenNext);
    out.push(x0 + (xp - x0) * tp, y0 + (yp - y0) * tp);
    out.push(x0 + (x1 - x0) * tn, y0 + (y1 - y0) * tn);
  }
  return out;
}

export function signedArea(pts: number[]): number {
  const n = pts.length / 2;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return a / 2;
}

export function polylineLength(pts: number[], closed = true): number {
  const n = pts.length / 2;
  let len = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (j === 0 && !closed) break;
    len += Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]);
  }
  return len;
}
