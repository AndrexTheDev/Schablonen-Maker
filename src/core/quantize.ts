/**
 * Tonwertzerlegung: 1D-k-Means auf der Helligkeit (monochrom, Banksy)
 * bzw. k-Means im CIE-Lab-Raum (Farbe).
 */

import { rgbToLab } from './color';

const MAX_SAMPLES = 24000;

function sampleStride(total: number, max: number) {
  return Math.max(1, Math.floor(total / max));
}

/** Sortierte Clusterzentren (aufsteigend) für k Tonwerte. */
export function kmeans1d(values: Float32Array, k: number, iters = 40): number[] {
  const kk = Math.max(1, Math.min(8, Math.round(k)));
  const stride = sampleStride(values.length, MAX_SAMPLES);
  const samples: number[] = [];
  for (let i = 0; i < values.length; i += stride) samples.push(values[i]);
  samples.sort((a, b) => a - b);
  if (samples.length === 0) return [0];

  const centers: number[] = [];
  for (let i = 0; i < kk; i++) {
    const q = (i + 0.5) / kk;
    centers.push(samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]);
  }
  const assign = new Int32Array(samples.length);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < samples.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        const d = Math.abs(samples[i] - centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    const sum = new Float64Array(kk);
    const cnt = new Uint32Array(kk);
    for (let i = 0; i < samples.length; i++) {
      sum[assign[i]] += samples[i];
      cnt[assign[i]]++;
    }
    for (let c = 0; c < kk; c++) {
      if (cnt[c] > 0) centers[c] = sum[c] / cnt[c];
      else centers[c] = centers[c] + (c === 0 ? -4 : 4);
    }
    if (!moved) break;
  }
  centers.sort((a, b) => a - b);
  return centers;
}

/** Schwellen zwischen benachbarten Zentren. */
export function thresholds(centers: number[]): number[] {
  const thr: number[] = [];
  for (let i = 0; i < centers.length - 1; i++) thr.push((centers[i] + centers[i + 1]) / 2);
  return thr;
}

/** Ordnet jeden Pixel dem Cluster 0..k-1 zu (0 = dunkelster Ton). */
export function assignLevels(values: Float32Array, thr: number[]): Uint8Array {
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    let level = 0;
    while (level < thr.length && v > thr[level]) level++;
    out[i] = level;
  }
  return out;
}

export interface ColorCluster {
  L: number;
  a: number;
  b: number;
  count: number;
}

/**
 * k-Means in Lab. Liefert Cluster (nach Helligkeit sortiert) und
 * eine Label-Map, deren Indizes zu den sortierten Clustern passen.
 */
export function kmeansLab(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  k: number,
  iters = 25
): { clusters: ColorCluster[]; labels: Uint8Array } {
  const kk = Math.max(2, Math.min(8, Math.round(k)));
  const n = w * h;
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [l, a, b] = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    L[i] = l;
    A[i] = a;
    B[i] = b;
  }
  const stride = sampleStride(n, MAX_SAMPLES);
  const sx: number[] = [];
  const sy: number[] = [];
  const sz: number[] = [];
  for (let i = 0; i < n; i += stride) {
    sx.push(L[i]);
    sy.push(A[i]);
    sz.push(B[i]);
  }
  const m = sx.length;
  const cL = new Float64Array(kk);
  const cA = new Float64Array(kk);
  const cB = new Float64Array(kk);
  // Initialisierung: nach Helligkeit gestaffelt (deterministisch)
  const idx = Array.from({ length: m }, (_, i) => i).sort((p, q) => sx[p] - sx[q]);
  for (let c = 0; c < kk; c++) {
    const p = idx[Math.min(m - 1, Math.floor(((c + 0.5) / kk) * m))];
    cL[c] = sx[p];
    cA[c] = sy[p];
    cB[c] = sz[p];
  }
  const assign = new Int32Array(m);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < m; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        const dl = sx[i] - cL[c];
        const da = sy[i] - cA[c];
        const db = sz[i] - cB[c];
        const d = dl * dl + da * da + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    const sL = new Float64Array(kk);
    const sA = new Float64Array(kk);
    const sB = new Float64Array(kk);
    const cnt = new Uint32Array(kk);
    for (let i = 0; i < m; i++) {
      const c = assign[i];
      sL[c] += sx[i];
      sA[c] += sy[i];
      sB[c] += sz[i];
      cnt[c]++;
    }
    for (let c = 0; c < kk; c++) {
      if (cnt[c] > 0) {
        cL[c] = sL[c] / cnt[c];
        cA[c] = sA[c] / cnt[c];
        cB[c] = sB[c] / cnt[c];
      }
    }
    if (!moved) break;
  }
  // Cluster nach Helligkeit sortieren (0 = hellster Ton)
  const order = Array.from({ length: kk }, (_, i) => i).sort((p, q) => cL[q] - cL[p]);
  const remap = new Int32Array(kk);
  order.forEach((oldIdx, newIdx) => (remap[oldIdx] = newIdx));
  const labels = new Uint8Array(n);
  const counts = new Uint32Array(kk);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < kk; c++) {
      const dl = L[i] - cL[c];
      const da = A[i] - cA[c];
      const db = B[i] - cB[c];
      const d = dl * dl + da * da + db * db;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const mapped = remap[best];
    labels[i] = mapped;
    counts[mapped]++;
  }
  const clusters: ColorCluster[] = order.map((oldIdx, newIdx) => ({
    L: cL[oldIdx],
    a: cA[oldIdx],
    b: cB[oldIdx],
    count: counts[newIdx],
  }));
  return { clusters, labels };
}

/** Lab -> sRGB (für Palettenvorschläge aus Clustern). */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  const X = 0.95047 * inv(fx);
  const Y = 1.0 * inv(fy);
  const Z = 1.08883 * inv(fz);
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const gam = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  return [gam(R), gam(G), gam(B)];
}

/**
 * Weicher Modusfilter auf der Label-Karte (Integralbilder, O(1) pro Pixel).
 *
 * Ersetzt das übliche Öffnen/Schließen der Binärmasken: Kanten werden
 * geglättet und Einzelpixel-Rauschen verschwindet, ohne dass zwischen zwei
 * Ebenen eine Lücke entsteht (jeder Pixel behält genau ein Label).
 */
export function refineLabels(
  labels: Uint8Array,
  w: number,
  h: number,
  count: number,
  radius: number
): Uint8Array {
  const r = Math.max(0, Math.round(radius));
  if (r < 1 || count < 2) return labels;
  const stride = w + 1;
  const sums: Float32Array[] = [];
  for (let l = 0; l < count; l++) {
    const s = new Float32Array(stride * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      const off = y * w;
      const outOff = (y + 1) * stride;
      const prevOff = y * stride;
      for (let x = 0; x < w; x++) {
        if (labels[off + x] === l) rowSum++;
        s[outOff + x + 1] = s[prevOff + x + 1] + rowSum;
      }
    }
    sums.push(s);
  }
  const out = new Uint8Array(labels.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r) * stride;
    const y1 = Math.min(h, y + r + 1) * stride;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const cur = labels[y * w + x];
      const sc = sums[cur] ?? sums[0];
      let best = cur;
      let bestVal = sc[y1 + x1] - sc[y0 + x1] - sc[y1 + x0] + sc[y0 + x0];
      for (let l = 0; l < count; l++) {
        if (l === cur) continue;
        const s = sums[l];
        const v = s[y1 + x1] - s[y0 + x1] - s[y1 + x0] + s[y0 + x0];
        if (v > bestVal + 1e-6) {
          bestVal = v;
          best = l;
        }
      }
      out[y * w + x] = best;
    }
  }
  return out;
}
