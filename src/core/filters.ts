/**
 * Filter für den Bildpfad: Kanten erhaltene Glättung (Bilateral),
 * Tonwertkorrektur, Canny-Kanten, Hintergrund-Entfernung.
 */

import { clamp } from './units';

export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const off = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[off + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[off + x] = sum / win;
      sum -= src[off + clamp(x - r, 0, w - 1)];
      sum += src[off + clamp(x + r + 1, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      sum -= tmp[clamp(y - r, 0, h - 1) * w + x];
      sum += tmp[clamp(y + r + 1, 0, h - 1) * w + x];
    }
  }
  return out;
}

/** Gauß-Approximation über drei Boxfilter. */
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0.3) return src.slice();
  const r = Math.max(1, Math.round(sigma * 1.2));
  let out = boxBlur(src, w, h, r);
  out = boxBlur(out, w, h, r);
  out = boxBlur(out, w, h, r);
  return out;
}

/**
 * Kanten erhaltende Glättung („Surface Blur“) als separable Näherung.
 * radius/sigmaR werden aus dem Regler 0..100 abgeleitet.
 */
export function bilateral(src: Float32Array, w: number, h: number, radius: number, sigmaR: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return src.slice();
  const spatial = new Float32Array(2 * r + 1);
  for (let d = -r; d <= r; d++) spatial[d + r] = Math.exp(-(d * d) / (2 * (r / 1.6) * (r / 1.6)));
  const inv = 1 / (2 * Math.max(1, sigmaR) * Math.max(1, sigmaR));
  const rangeLut = new Float32Array(256);
  for (let i = 0; i < 256; i++) rangeLut[i] = Math.exp(-(i * i) * inv);

  const tmp = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) {
      const center = src[off + x];
      let wsum = 0;
      let vsum = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let nx = x0; nx <= x1; nx++) {
        const v = src[off + nx];
        const wgt = spatial[nx - x + r] * rangeLut[Math.abs((v - center) | 0) & 255];
        wsum += wgt;
        vsum += v * wgt;
      }
      tmp[off + x] = vsum / wsum;
    }
  }
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const center = tmp[y * w + x];
      let wsum = 0;
      let vsum = 0;
      for (let ny = y0; ny <= y1; ny++) {
        const v = tmp[ny * w + x];
        const wgt = spatial[ny - y + r] * rangeLut[Math.abs((v - center) | 0) & 255];
        wsum += wgt;
        vsum += v * wgt;
      }
      out[y * w + x] = vsum / wsum;
    }
  }
  return out;
}

/**
 * Tonwertkorrektur: S-Kurve für Kontrast (Endpunkte bleiben fix),
 * additive Helligkeit, optional invertieren.
 * contrast: 0..100 (50 = neutral)
 */
export function gradeTone(
  luma: Float32Array,
  opts: { contrast: number; brightness: number; invert: boolean; autoLevels?: boolean }
): Float32Array {
  const out = new Float32Array(luma.length);
  let lo = 0;
  let hi = 255;
  if (opts.autoLevels) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < luma.length; i++) hist[clamp(luma[i] | 0, 0, 255)]++;
    const total = luma.length;
    let acc = 0;
    let p2 = 0;
    let p98 = 255;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc / total >= 0.02) {
        p2 = i;
        break;
      }
    }
    acc = 0;
    for (let i = 255; i >= 0; i--) {
      acc += hist[i];
      if (acc / total >= 0.02) {
        p98 = i;
        break;
      }
    }
    lo = p2;
    hi = Math.max(p2 + 8, p98);
  }
  const c = (clamp(opts.contrast, 0, 100) - 50) / 50; // -1..1
  const k = c >= 0 ? 1 + c * 2.2 : 1 + c * 0.75;
  const tanhK = Math.tanh(k / 2);
  const bright = opts.brightness * 1.1;
  // S-Kurve als Tabelle (Math.tanh pro Pixel wäre der Flaschenhals)
  const lut = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const t = i / 1023;
    lut[i] = (0.5 + Math.tanh((t - 0.5) * k) / (2 * tanhK)) * 255;
  }
  const scale = 1023 / 255;
  const inv = 1 / (hi - lo);
  for (let i = 0; i < out.length; i++) {
    let v = (luma[i] - lo) * inv * 255;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    v = lut[(v * scale) | 0] + bright;
    if (opts.invert) v = 255 - v;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

export function percentile(values: Float32Array, p: number): number {
  const hist = new Uint32Array(2048);
  const scale = 2047 / 255;
  for (let i = 0; i < values.length; i++) {
    const idx = clamp(Math.round(values[i] * scale), 0, 2047);
    hist[idx]++;
  }
  const target = values.length * p;
  let acc = 0;
  for (let i = 0; i < 2048; i++) {
    acc += hist[i];
    if (acc >= target) return i / scale;
  }
  return 255;
}

/**
 * Canny-Kantendetektion (dünne 1-px-Kanten) mit Hysterese.
 * strength 0..100: höher = mehr Kanten.
 */
export function canny(luma: Float32Array, w: number, h: number, strength: number, sigma = 1.4): Uint8Array {
  const blur = gaussianBlur(luma, w, h, sigma);
  const mag = new Float32Array(w * h);
  const gxA = new Float32Array(w * h);
  const gyA = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = blur[i - w - 1];
      const tc = blur[i - w];
      const tr = blur[i - w + 1];
      const ml = blur[i - 1];
      const mr = blur[i + 1];
      const bl = blur[i + w - 1];
      const bc = blur[i + w];
      const br = blur[i + w + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      gxA[i] = gx;
      gyA[i] = gy;
      mag[i] = Math.hypot(gx, gy);
    }
  }
  // Non-Maximum-Suppression (4 Richtungen)
  const thin = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m === 0) continue;
      const gx = gxA[i];
      const gy = gyA[i];
      let a: number;
      let b: number;
      if (Math.abs(gy) > Math.abs(gx) * 2.4142) {
        a = mag[i - w];
        b = mag[i + w];
      } else if (Math.abs(gx) > Math.abs(gy) * 2.4142) {
        a = mag[i - 1];
        b = mag[i + 1];
      } else if (gx * gy > 0) {
        a = mag[i - w - 1];
        b = mag[i + w + 1];
      } else {
        a = mag[i - w + 1];
        b = mag[i + w - 1];
      }
      if (m >= a && m >= b) thin[i] = m;
    }
  }
  // Schwelle über die gewünschte Kantendichte: 0,4 % der Pixel bei Stärke 0
  // bis 4 % bei Stärke 100. Eine Perzentil-Schwelle wie vorher fiel unterhalb
  // von Stärke 40 auf „keine Kante“ zusammen – die Konturen-Ebene blieb leer.
  const density = 0.004 + (clamp(strength, 0, 100) / 100) * 0.036;
  const high = Math.max(8, percentile(thin, 1 - density));
  const low = high * 0.42;
  const out = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  for (let i = 0; i < thin.length; i++) {
    if (thin[i] >= high) {
      out[i] = 1;
      stack[sp++] = i;
    }
  }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const q = ny * w + nx;
        if (!out[q] && thin[q] >= low) {
          out[q] = 1;
          stack[sp++] = q;
        }
      }
    }
  }
  return out;
}

function thickValues(a: Float32Array) {
  // Nur Nicht-Null-Werte für die Perzentilbildung
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > 0) n++;
  const out = new Float32Array(n || 1);
  let k = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > 0) out[k++] = a[i];
  return out;
}

/**
 * Entfernt den Hintergrund per Flutfüllung vom Bildrand aus („Zauberstab“)
 * und räumt anschließend auf: Übrig gebliebene Flecken im Hintergrund
 * (Textur, Vignette) werden dem Hintergrund zugeschlagen, winzige
 * Fremdkörper dem Motiv.
 * Rückgabe: Maske 1 = Hintergrund.
 */
export function backgroundMask(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance: number
): Uint8Array {
  // Auf einer weichgezeichneten Kopie entscheiden: Wandtextur, Rauschen und
  // Filmkorn verschwinden, große Helligkeitsverläufe bleiben. Ohne diesen
  // Schritt bleibt die halbe Wand als „Motiv“ stehen.
  const soft = blurRGBA(rgba, w, h, Math.max(2, Math.round(Math.min(w, h) / 150)));
  const mask = floodBackground(soft, w, h, tolerance);
  // Weichgezeichnete Maske liegt 1-2 px neben der echten Motivkante. Ein
  // Pixel Erosion schiebt die Kante ins Motiv, sonst bleibt beim Sprühen ein
  // heller Saum (Papier) um die Figur stehen.
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[i] = 1;
        continue;
      }
      out[i] = mask[i - 1] & mask[i + 1] & mask[i - w] & mask[i + w];
    }
  }
  return out;
}

/** Zwei Boxfilter ≈ Gauß, auf allen drei Kanälen. */
export function blurRGBA(rgba: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  if (radius <= 0) return rgba;
  const out = new Uint8ClampedArray(rgba.length);
  const ch = new Float32Array(w * h);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < w * h; i++) ch[i] = rgba[i * 4 + c];
    let blurred = boxBlur(ch, w, h, radius);
    blurred = boxBlur(blurred, w, h, radius);
    for (let i = 0; i < w * h; i++) out[i * 4 + c] = blurred[i];
  }
  for (let i = 0; i < w * h; i++) out[i * 4 + 3] = 255;
  return out;
}

function floodBackground(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance: number
): Uint8Array {
  // Referenzfarbe: Median der Randpixel
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (i: number) => {
    rs.push(rgba[i * 4]);
    gs.push(rgba[i * 4 + 1]);
    bs.push(rgba[i * 4 + 2]);
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  const mid = rs.length >> 1;
  const ref: [number, number, number] = [rs[mid], gs[mid], bs[mid]];
  const tol = Math.pow(clamp(tolerance, 0, 100) * 1.35, 2);

  const dist = (i: number) => {
    const dr = rgba[i * 4] - ref[0];
    const dg = rgba[i * 4 + 1] - ref[1];
    const db = rgba[i * 4 + 2] - ref[2];
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
  };

  const mask = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = y * w + x;
      if (!mask[i] && dist(i) < tol) {
        mask[i] = 1;
        stack[sp++] = i;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = y * w + x;
      if (!mask[i] && dist(i) < tol) {
        mask[i] = 1;
        stack[sp++] = i;
      }
    }
  }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0 && !mask[p - 1] && dist(p - 1) < tol) {
      mask[p - 1] = 1;
      stack[sp++] = p - 1;
    }
    if (x < w - 1 && !mask[p + 1] && dist(p + 1) < tol) {
      mask[p + 1] = 1;
      stack[sp++] = p + 1;
    }
    if (y > 0 && !mask[p - w] && dist(p - w) < tol) {
      mask[p - w] = 1;
      stack[sp++] = p - w;
    }
    if (y < h - 1 && !mask[p + w] && dist(p + w) < tol) {
      mask[p + w] = 1;
      stack[sp++] = p + w;
    }
  }
  return cleanupBackground(mask, w, h);
}

/**
 * Nachbereitung der Hintergrundmaske:
 *  - kleine „Nicht-Hintergrund“-Flecken, die im Hintergrund liegen, werden
 *    Hintergrund (Textur, Staub, Vignette)
 *  - kleine „Hintergrund“-Löcher innerhalb des Motivs werden Motiv
 */
export function cleanupBackground(mask: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const out = mask.slice();

  // 1) Zusammenhang des Motivs (¬mask) bestimmen
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = mask[i] ? 0 : 1;
  const comps = label4(fg, w, h);
  let largest = 0;
  for (let i = 1; i <= comps.count; i++) largest = Math.max(largest, comps.areas[i]);
  const keepMin = Math.max(32, largest * 0.02);
  for (let i = 0; i < n; i++) {
    const l = comps.labels[i];
    if (l && comps.areas[l] < keepMin) out[i] = 1; // Fleck -> Hintergrund
  }

  // 2) Löcher im Hintergrund füllen (Hintergrund, der vom Motiv
  //    umschlossen ist, bleibt Motiv – deshalb nur kleine Löcher schließen)
  const bg = new Uint8Array(n);
  for (let i = 0; i < n; i++) bg[i] = out[i] ? 1 : 0;
  const bgComps = label4(bg, w, h);
  let bgLargest = 0;
  for (let i = 1; i <= bgComps.count; i++) bgLargest = Math.max(bgLargest, bgComps.areas[i]);
  for (let i = 1; i <= bgComps.count; i++) {
    if (!bgComps.touchesBorder[i] && bgComps.areas[i] < Math.max(48, bgLargest * 0.25)) {
      // eingeschlossener Hintergrund-Rest -> Motiv
      for (let p = 0; p < n; p++) if (bgComps.labels[p] === i) out[p] = 0;
    }
  }
  return out;
}

interface L4 {
  labels: Int32Array;
  count: number;
  areas: Int32Array;
  touchesBorder: Uint8Array;
}

/** Einfache 4-Nachbar-Zusammenhangsanalyse (intern, ohne Zyklus-Import). */
function label4(mask: Uint8Array, w: number, h: number): L4 {
  const labels = new Int32Array(w * h);
  const areas: number[] = [0];
  const touches: number[] = [0];
  const stack = new Int32Array(w * h);
  let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || labels[s]) continue;
    const id = ++count;
    let sp = 0;
    stack[sp++] = s;
    labels[s] = id;
    let area = 0;
    let border = 0;
    while (sp > 0) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = 1;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) {
        labels[p - 1] = id;
        stack[sp++] = p - 1;
      }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) {
        labels[p + 1] = id;
        stack[sp++] = p + 1;
      }
      if (y > 0 && mask[p - w] && !labels[p - w]) {
        labels[p - w] = id;
        stack[sp++] = p - w;
      }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) {
        labels[p + w] = id;
        stack[sp++] = p + w;
      }
    }
    areas.push(area);
    touches.push(border);
  }
  return { labels, count, areas: Int32Array.from(areas), touchesBorder: Uint8Array.from(touches) };
}

/** Halbe Auflösung (2x2-Mittelwert). */
export function downsample2(src: Float32Array, w: number, h: number): { data: Float32Array; w: number; h: number } {
  const w2 = Math.max(1, w >> 1);
  const h2 = Math.max(1, h >> 1);
  const out = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    const y0 = y * 2;
    const y1 = Math.min(h - 1, y0 + 1);
    for (let x = 0; x < w2; x++) {
      const x0 = x * 2;
      const x1 = Math.min(w - 1, x0 + 1);
      out[y * w2 + x] =
        (src[y0 * w + x0] + src[y0 * w + x1] + src[y1 * w + x0] + src[y1 * w + x1]) * 0.25;
    }
  }
  return { data: out, w: w2, h: h2 };
}

/** Bilineare Vergrößerung. */
export function upsampleBilinear(src: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  const sx = w / W;
  const sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const a = src[y0 * w + x0];
      const b = src[y0 * w + x1];
      const c = src[y1 * w + x0];
      const d = src[y1 * w + x1];
      out[y * W + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}
