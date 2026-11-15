/**
 * Binäre Morphologie + Distanztransformation.
 *
 * Alle Masken sind Uint8Array der Länge w*h mit 1 = gesetzt.
 * Die Fensteroperationen laufen über eine monotone Deque, dadurch O(N)
 * unabhängig vom Radius (wichtig bei 2–3 Megapixeln im Worker).
 */

function slidingMax1D(src: Uint8Array, dst: Uint8Array, n: number, r: number) {
  // dst[i] = max(src[i-r..i+r])
  const deque = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + r);
    if (src[j]) {
      while (tail > head && src[deque[tail - 1]] <= src[j]) tail--;
      deque[tail++] = j;
    }
    const k = i - r - 1;
    while (tail > head && deque[head] <= k) head++;
    dst[i] = tail > head ? src[deque[head]] : 0;
  }
}

function slidingMin1D(src: Uint8Array, dst: Uint8Array, n: number, r: number) {
  const deque = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + r);
    while (tail > head && src[deque[tail - 1]] >= src[j]) tail--;
    deque[tail++] = j;
    const k = i - r - 1;
    while (tail > head && deque[head] <= k) head++;
    dst[i] = tail > head ? src[deque[head]] : 1;
  }
}

/** Rechteck-Strukturierungselement, horizontal + vertikal getrennt. */
export function dilateRect(src: Uint8Array, w: number, h: number, r: number, out?: Uint8Array): Uint8Array {
  if (r <= 0) {
    const c = out ?? new Uint8Array(src.length);
    c.set(src);
    return c;
  }
  const tmp = new Uint8Array(src.length);
  const row = new Uint8Array(w);
  const rowOut = new Uint8Array(w);
  for (let y = 0; y < h; y++) {
    const off = y * w;
    row.set(src.subarray(off, off + w));
    slidingMax1D(row, rowOut, w, r);
    tmp.set(rowOut, off);
  }
  const res = out ?? new Uint8Array(src.length);
  const col = new Uint8Array(h);
  const colOut = new Uint8Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = tmp[y * w + x];
    slidingMax1D(col, colOut, h, r);
    for (let y = 0; y < h; y++) res[y * w + x] = colOut[y];
  }
  return res;
}

export function erodeRect(src: Uint8Array, w: number, h: number, r: number, out?: Uint8Array): Uint8Array {
  if (r <= 0) {
    const c = out ?? new Uint8Array(src.length);
    c.set(src);
    return c;
  }
  const tmp = new Uint8Array(src.length);
  const row = new Uint8Array(w);
  const rowOut = new Uint8Array(w);
  for (let y = 0; y < h; y++) {
    const off = y * w;
    row.set(src.subarray(off, off + w));
    slidingMin1D(row, rowOut, w, r);
    tmp.set(rowOut, off);
  }
  const res = out ?? new Uint8Array(src.length);
  const col = new Uint8Array(h);
  const colOut = new Uint8Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = tmp[y * w + x];
    slidingMin1D(col, colOut, h, r);
    for (let y = 0; y < h; y++) res[y * w + x] = colOut[y];
  }
  return res;
}

/**
 * Dilatation mit echter Kreisscheibe, exakt und O(N):
 * Ein Pixel gehört zur Dilatation, wenn sein Abstand zur Maske <= r ist.
 * Das ist deutlich schneller als (2r+1) Fensterdurchläufe und liefert
 * zusätzlich eine echte euklidische Scheibe (keine Achteck-Treppchen).
 */
export function dilateDisc(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const dt = distanceTransform(src, w, h, 1);
  const out = new Uint8Array(src.length);
  const r2 = r * r;
  for (let i = 0; i < out.length; i++) if (dt[i] * dt[i] <= r2 + 1e-6) out[i] = 1;
  return out;
}

export function erodeDisc(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const bg = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) bg[i] = src[i] ? 0 : 1;
  // Rand gilt als Hintergrund: Abstand zum Bildrand mitzählen
  const dt = distanceTransform(bg, w, h, 1);
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const borderDist = Math.min(x, y, w - 1 - x, h - 1 - y) + 1;
      const d = Math.min(dt[i], borderDist);
      out[i] = d > r ? 1 : 0;
    }
  }
  return out;
}

export function openDisc(src: Uint8Array, w: number, h: number, r: number) {
  return dilateDisc(erodeDisc(src, w, h, r), w, h, r);
}

export function closeDisc(src: Uint8Array, w: number, h: number, r: number) {
  return erodeDisc(dilateDisc(src, w, h, r), w, h, r);
}

export function invert(mask: Uint8Array) {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

/** Vereinigung mehrerer Masken. */
export function union(...masks: Uint8Array[]) {
  const out = new Uint8Array(masks[0].length);
  for (const m of masks) for (let i = 0; i < m.length; i++) if (m[i]) out[i] = 1;
  return out;
}

/** Anzahl gesetzter Pixel. */
export function count(mask: Uint8Array) {
  let c = 0;
  for (let i = 0; i < mask.length; i++) c += mask[i];
  return c;
}

/** Exakte euklidische Distanztransformation (Felzenszwalb & Huttenlocher). */
export function distanceTransform(mask: Uint8Array, w: number, h: number, target = 1): Float32Array {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const INF = 1e20;
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] === target ? 0 : INF;

  const edt1d = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const dq = q - v[k];
      d[q] = dq * dq + f[v[k]];
    }
  };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) f[x] = grid[off + x];
    edt1d(w);
    for (let x = 0; x < w; x++) grid[off + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}


/**
 * Verdickt ausschließlich *dünne Strukturen* auf eine Mindestbreite.
 *
 * Wichtig: Der Rand einer großen Fläche ist ebenfalls „dünn“ im Sinne der
 * Distanztransformation. Würde man ihn mitdilatieren, wüchse die Fläche in
 * jede Öffnung hinein und das Bild würde zulaufen. Deshalb werden nur
 * Kammpixel verstärkt, die weiter als r von dicken Bereichen entfernt sind
 * – also echte schmale Stege bzw. schmale Farblinien.
 */
export function thickenThin(mask: Uint8Array, w: number, h: number, minPx: number): Uint8Array {
  if (minPx <= 2) return mask;
  const r = minPx / 2;
  // Abstand zur nächsten Öffnung (Zielwert 0!), sonst wäre jeder
  // Materialpixel 0 weit von sich selbst entfernt und damit „dünn“.
  const dt = distanceTransform(mask, w, h, 0);
  const thin = new Uint8Array(w * h);
  const thick = new Uint8Array(w * h);
  let thinCount = 0;
  let thickCount = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    if (dt[i] < r) {
      thin[i] = 1;
      thinCount++;
    } else {
      thick[i] = 1;
      thickCount++;
    }
  }
  if (thinCount === 0) return mask;
  let ridge = thin;
  if (thickCount > 0) {
    // Rechteck genügt hier (Kanten werden später ohnehin geglättet) und ist
    // ein Vielfaches schneller als eine Scheibe.
    const nearThick = dilateRect(thick, w, h, Math.ceil(r) + 1);
    ridge = new Uint8Array(w * h);
    let any = false;
    for (let i = 0; i < thin.length; i++) {
      if (thin[i] && !nearThick[i]) {
        ridge[i] = 1;
        any = true;
      }
    }
    if (!any) return mask;
  }
  const grown = dilateRect(ridge, w, h, Math.ceil(r));
  const out = mask.slice();
  for (let i = 0; i < out.length; i++) if (grown[i]) out[i] = 1;
  return out;
}
