/**
 * Inseln & Stege – das Herzstück einer brauchbaren Schablone.
 *
 * Eine Schablone ist ein Blech mit Ausschnitten. Material, das komplett von
 * Ausschnitten umschlossen ist (z. B. das Innere eines „O“, die Pupille im
 * Auge), fällt beim Ausschneiden heraus – das sind „Inseln“.
 *
 * Lösung: eine kurze Materialbrücke („Steg“) verbindet die Insel mit dem
 * Rahmen. Dafür wird ein kürzester Pfad durch die Öffnung gesucht
 * (Dijkstra, Mehrquellen-Suche vom Rahmen aus). Pfade durch Bereiche, die
 * eine spätere, dunklere Ebene übermalt, werden bevorzugt – dort ist der
 * Steg im fertigen Bild unsichtbar.
 */

import { labelComponents, rootLabels } from './components';

export interface BridgeOptions {
  /** Stegbreite in Pixeln */
  width: number;
  /** 1 = wird von einer späteren Ebene übermalt -> billiger Pfad */
  prefer?: Uint8Array;
  /** Zusätzlicher Kostenfaktor pro Pixel (z. B. Bildkanten meiden) */
  costMap?: Float32Array;
  maxPasses?: number;
  /** Harte Obergrenze für die Pfadlänge in Pixeln */
  maxDistancePx?: number;
}

export interface BridgeResult {
  /** Material nach dem Setzen der Stege (dieselbe Array-Instanz) */
  material: Uint8Array;
  islands: number;
  bridges: number;
  remaining: number;
  islandMask: Uint8Array;
  bridgeMask: Uint8Array;
  longestBridgePx: number;
}

class MinHeap {
  private idx: Int32Array;
  private cost: Float32Array;
  private size = 0;

  constructor(capacity: number) {
    const cap = Math.max(64, capacity);
    this.idx = new Int32Array(cap);
    this.cost = new Float32Array(cap);
  }

  get length() {
    return this.size;
  }

  push(i: number, c: number) {
    if (this.size >= this.idx.length) {
      const idx = new Int32Array(this.idx.length * 2);
      idx.set(this.idx);
      const cost = new Float32Array(this.cost.length * 2);
      cost.set(this.cost);
      this.idx = idx;
      this.cost = cost;
    }
    let p = this.size++;
    this.idx[p] = i;
    this.cost[p] = c;
    while (p > 0) {
      const parent = (p - 1) >> 1;
      if (this.cost[parent] <= this.cost[p]) break;
      this.swap(parent, p);
      p = parent;
    }
  }

  pop(): { i: number; c: number } {
    const i = this.idx[0];
    const c = this.cost[0];
    this.size--;
    if (this.size > 0) {
      this.idx[0] = this.idx[this.size];
      this.cost[0] = this.cost[this.size];
      let p = 0;
      for (;;) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < this.size && this.cost[l] < this.cost[m]) m = l;
        if (r < this.size && this.cost[r] < this.cost[m]) m = r;
        if (m === p) break;
        this.swap(m, p);
        p = m;
      }
    }
    return { i, c };
  }

  private swap(a: number, b: number) {
    const ti = this.idx[a];
    this.idx[a] = this.idx[b];
    this.idx[b] = ti;
    const tc = this.cost[a];
    this.cost[a] = this.cost[b];
    this.cost[b] = tc;
  }
}

const N8X = [1, -1, 0, 0, 1, 1, -1, -1];
const N8Y = [0, 0, 1, -1, 1, -1, 1, -1];
const N8C = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

export function addBridges(material: Uint8Array, w: number, h: number, opts: BridgeOptions): BridgeResult {
  const width = Math.max(1, opts.width);
  const maxPasses = Math.max(1, opts.maxPasses ?? 2);
  const prefer = opts.prefer;
  const costMap = opts.costMap;
  const maxDist = opts.maxDistancePx ?? Infinity;
  const n = w * h;

  const cur = material;
  const islandMask = new Uint8Array(n);
  const bridgeMask = new Uint8Array(n);
  let islandsFound = 0;
  let bridges = 0;
  let remaining = 0;
  let longest = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    const comps = labelComponents(cur, w, h, 8);
    const root = rootLabels(comps);
    const done = new Uint8Array(n);
    const isIsland = new Uint8Array(comps.count + 1);
    const islandList: number[] = [];
    for (let i = 1; i <= comps.count; i++) {
      if (!root[i] && comps.areas[i] > 0) {
        isIsland[i] = 1;
        islandList.push(i);
      }
    }
    remaining = islandList.length;
    if (islandList.length === 0) break;
    if (pass === 0) {
      islandsFound = islandList.length;
      for (let i = 0; i < n; i++) {
        const l = comps.labels[i];
        if (l && isIsland[l]) islandMask[i] = 1;
      }
    }

    // ---- Mehrquellen-Suche (0-1-BFS): Rahmen -> Inseln ----
    // Kosten 0 für Pixel, die eine spätere Ebene übermalt (Steg unsichtbar),
    // Kosten 1 sonst. Zwei Buckets genügen -> O(N), kein Heap nötig.
    const best = new Int32Array(n).fill(0x7fffffff);
    const prev = new Int32Array(n).fill(-1);
    let q0 = new Int32Array(n);
    let q1 = new Int32Array(n);
    let n0 = 0;
    let i0 = 0;
    let n1 = 0;
    let i1 = 0;
    let dist = 0;
    const maxSteps = opts.maxDistancePx ?? 600;
    const reachedPath = new Map<number, number>();

    for (let p = 0; p < n; p++) {
      if (!cur[p] || !root[comps.labels[p]]) continue;
      const x = p % w;
      const y = (p - x) / w;
      for (let k = 0; k < 8; k++) {
        const nx = x + N8X[k];
        const ny = y + N8Y[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (cur[q] || best[q] === 0) continue;
        best[q] = 0;
        prev[q] = -1;
        q0[n0++] = q;
      }
    }

    while (reachedPath.size < islandList.length) {
      let p = -1;
      while (i0 < n0) {
        const c = q0[i0++];
        if (best[c] === dist && !done[c]) {
          p = c;
          break;
        }
      }
      if (p < 0) {
        if (i1 >= n1) break;
        const tmp = q0;
        q0 = q1;
        q1 = tmp;
        n0 = n1;
        i0 = 0;
        n1 = 0;
        i1 = 0;
        dist++;
        if (dist > maxSteps) break;
        continue;
      }
      done[p] = 1;
      const x = p % w;
      const y = (p - x) / w;

      for (let k = 0; k < 8; k++) {
        const nx = x + N8X[k];
        const ny = y + N8Y[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!cur[q]) continue;
        const lab = comps.labels[q];
        if (lab && isIsland[lab] && !reachedPath.has(lab)) reachedPath.set(lab, p);
      }

      for (let k = 0; k < 8; k++) {
        const nx = x + N8X[k];
        const ny = y + N8Y[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (cur[q] || done[q]) continue;
        const step = prefer !== undefined && prefer[q] ? 0 : 1;
        const nd = dist + step;
        if (nd < best[q]) {
          best[q] = nd;
          prev[q] = p;
          if (step === 0) {
            if (n0 < n) q0[n0++] = q;
          } else if (n1 < n) {
            q1[n1++] = q;
          }
        }
      }
    }

    // ---- Stege zeichnen ----
    let added = 0;
    for (const end of reachedPath.values()) {
      const path: number[] = [];
      let p = end;
      let guard = 0;
      while (p >= 0 && guard++ <= n) {
        path.push(p);
        p = prev[p];
      }
      if (path.length === 0) continue;
      if (path.length > longest) longest = path.length;
      stampPath(cur, w, h, path, width, bridgeMask);
      added++;
      bridges++;
    }
    remaining = islandList.length - reachedPath.size;
    if (added === 0) break;
  }

  const after = labelComponents(cur, w, h, 8);
  const afterRoot = rootLabels(after);
  let stillIslands = 0;
  for (let i = 1; i <= after.count; i++) if (!afterRoot[i] && after.areas[i] > 0) stillIslands++;
  remaining = Math.max(remaining, stillIslands);

  return { material: cur, islands: islandsFound, bridges, remaining, islandMask, bridgeMask, longestBridgePx: longest };
}

/** Zeichnet einen Steg (dicke Linie mit runden Enden) in das Material. */
function stampPath(
  material: Uint8Array,
  w: number,
  h: number,
  path: number[],
  width: number,
  bridgeMask?: Uint8Array
) {
  const r = width / 2;
  const rr = r + 1;
  const r2 = r * r;
  const rr2 = rr * rr;
  const ri = Math.ceil(rr);
  const stamp = (p: number, radius2: number, radius: number) => {
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -ri; dy <= ri; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > radius2) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const q = ny * w + nx;
        if (!material[q]) {
          material[q] = 1;
          if (bridgeMask) bridgeMask[q] = 1;
        }
      }
    }
    void radius;
  };
  for (let i = 0; i < path.length; i++) stamp(path[i], r2, r);
  if (path.length > 0) {
    // Enden etwas in das Material hinein verlängern
    stamp(path[0], rr2, rr);
    stamp(path[path.length - 1], rr2, rr);
  }
}

/** Inseln zählen, ohne sie zu reparieren (Statistik/Anzeige). */
export function findIslands(material: Uint8Array, w: number, h: number) {
  const comps = labelComponents(material, w, h, 8);
  const root = rootLabels(comps);
  let count = 0;
  let pixels = 0;
  for (let i = 1; i <= comps.count; i++) {
    if (!root[i]) {
      count++;
      pixels += comps.areas[i];
    }
  }
  return { count, pixels };
}
