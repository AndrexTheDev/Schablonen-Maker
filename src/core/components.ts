/** Zusammenhangsanalyse (Connected Components) für Binärmasken. */

export interface Components {
  /** 0 = Hintergrund, 1..count = Komponenten */
  labels: Int32Array;
  count: number;
  areas: Int32Array; // Index 0 ungenutzt
  minX: Int32Array;
  minY: Int32Array;
  maxX: Int32Array;
  maxY: Int32Array;
  touchesBorder: Uint8Array;
}

const OFF4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const OFF8 = [...OFF4, [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function labelComponents(mask: Uint8Array, w: number, h: number, conn: 4 | 8 = 8): Components {
  const labels = new Int32Array(w * h);
  const areas: number[] = [0];
  const minX: number[] = [0];
  const minY: number[] = [0];
  const maxX: number[] = [0];
  const maxY: number[] = [0];
  const touchesBorder: number[] = [0];
  const stack = new Int32Array(w * h);
  const offs = conn === 8 ? OFF8 : OFF4;
  let count = 0;

  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    count++;
    const id = count;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    let area = 0;
    let bMinX = w;
    let bMinY = h;
    let bMaxX = 0;
    let bMaxY = 0;
    let border = 0;
    while (sp > 0) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      const y = (p - x) / w;
      if (x < bMinX) bMinX = x;
      if (y < bMinY) bMinY = y;
      if (x > bMaxX) bMaxX = x;
      if (y > bMaxY) bMaxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = 1;
      for (let k = 0; k < offs.length; k++) {
        const nx = x + offs[k][0];
        const ny = y + offs[k][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !labels[q]) {
          labels[q] = id;
          stack[sp++] = q;
        }
      }
    }
    areas.push(area);
    minX.push(bMinX);
    minY.push(bMinY);
    maxX.push(bMaxX);
    maxY.push(bMaxY);
    touchesBorder.push(border);
  }

  return {
    labels,
    count,
    areas: Int32Array.from(areas),
    minX: Int32Array.from(minX),
    minY: Int32Array.from(minY),
    maxX: Int32Array.from(maxX),
    maxY: Int32Array.from(maxY),
    touchesBorder: Uint8Array.from(touchesBorder),
  };
}

/** Entfernt Komponenten, die kleiner als minArea sind (Rand wird geschont). */
export function removeSmallComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minAreaPx: number,
  opts: { keepTouchingBorder?: boolean; maxComponents?: number } = {}
): { mask: Uint8Array; removed: number } {
  if (minAreaPx <= 1) return { mask, removed: 0 };
  const comps = labelComponents(mask, w, h, 8);
  const keepBorder = opts.keepTouchingBorder !== false;
  const kill = new Uint8Array(comps.count + 1);
  let removed = 0;
  for (let i = 1; i <= comps.count; i++) {
    if (comps.areas[i] < minAreaPx && !(keepBorder && comps.touchesBorder[i])) {
      kill[i] = 1;
      removed++;
    }
  }
  if (!removed) return { mask, removed: 0 };
  // Große Komponenten notfalls auch behalten (Sicherheitsnetz)
  if (opts.maxComponents) {
    const order = Array.from({ length: comps.count }, (_, i) => i + 1).sort((a, b) => comps.areas[b] - comps.areas[a]);
    let alive = 0;
    for (let i = 0; i < order.length; i++) {
      if (kill[order[i]]) continue;
      alive++;
      if (alive > opts.maxComponents) kill[order[i]] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const l = comps.labels[i];
    if (l && !kill[l]) out[i] = 1;
  }
  return { mask: out, removed: kill.reduce((a, b) => a + b, 0) };
}

/** Komponenten, die den Bildrand berühren (= „Rahmen“ des Materials). */
export function rootLabels(comps: Components): Uint8Array {
  const root = new Uint8Array(comps.count + 1);
  let any = false;
  for (let i = 1; i <= comps.count; i++) {
    if (comps.touchesBorder[i]) {
      root[i] = 1;
      any = true;
    }
  }
  if (!any && comps.count > 0) {
    // Kein Randkontakt: größte Komponente als Träger definieren
    let best = 1;
    for (let i = 2; i <= comps.count; i++) if (comps.areas[i] > comps.areas[best]) best = i;
    root[best] = 1;
  }
  return root;
}

/**
 * Entfernt kleine Tonflächen-Partikel, indem sie der häufigsten
 * Nachbar-Tonstufe zugeschlagen werden.
 *
 * Das ist der wichtigste Schritt gegen „Sprenkel“: Ohne ihn bleiben
 * Rauschflecken im Himmel/Hintergrund als winzige Flächen stehen, die im
 * fertigen Bild als Punkte erscheinen und in jeder anderen Ebene als
 * Insel einen zusätzlichen Steg erzwingen.
 */
export function mergeSmallRegions(
  labels: Uint8Array,
  w: number,
  h: number,
  levelCount: number,
  minAreaPx: number,
  maxIterations = 2
): number {
  if (minAreaPx <= 1 || levelCount < 2) return 0;
  let mergedTotal = 0;
  const counts = new Int32Array(levelCount + 1);
  const queue = new Int32Array(w * h);

  for (let iter = 0; iter < maxIterations; iter++) {
    const reg = labelRegions(labels, w, h);
    let merged = 0;
    for (let id = 1; id <= reg.count; id++) {
      if (reg.areas[id] >= minAreaPx) continue;
      const level = reg.levelOf[id];
      const x0 = Math.max(0, reg.minX[id]);
      const y0 = Math.max(0, reg.minY[id]);
      const x1 = Math.min(w - 1, reg.maxX[id]);
      const y1 = Math.min(h - 1, reg.maxY[id]);
      counts.fill(0);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (reg.comp[y * w + x] !== id) continue;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const nl = labels[ny * w + nx];
              if (nl !== level) counts[nl]++;
            }
          }
        }
      }
      let best = -1;
      let bestVal = 0;
      for (let l = 0; l < levelCount; l++) {
        if (l !== level && counts[l] > bestVal) {
          bestVal = counts[l];
          best = l;
        }
      }
      if (best < 0) continue;
      // Partikel umschreiben (Flutfüllung innerhalb des eigenen Bereichs)
      let start = -1;
      for (let y = y0; y <= y1 && start < 0; y++) {
        for (let x = x0; x <= x1; x++) {
          if (reg.comp[y * w + x] === id) {
            start = y * w + x;
            break;
          }
        }
      }
      if (start < 0) continue;
      let sp = 0;
      queue[sp++] = start;
      labels[start] = best;
      while (sp > 0) {
        const p = queue[--sp];
        const px = p % w;
        const py = (p - px) / w;
        for (let k = 0; k < 4; k++) {
          const nx = px + OFF4[k][0];
          const ny = py + OFF4[k][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (reg.comp[q] === id && labels[q] === level) {
            labels[q] = best;
            queue[sp++] = q;
          }
        }
      }
      merged++;
    }
    mergedTotal += merged;
    if (merged === 0) break;
  }
  return mergedTotal;
}

/**
 * Zusammenhangskomponenten der Tonwertkarte: zwei Pixel gehören zusammen,
 * wenn sie dasselbe Label haben und benachbart sind. Ein Durchlauf statt
 * ein Durchlauf pro Tonstufe (4x schneller).
 */
export function labelRegions(labels: Uint8Array, w: number, h: number) {
  const comp = new Int32Array(w * h);
  const areas: number[] = [0];
  const levelOf: number[] = [0];
  const minX: number[] = [0];
  const minY: number[] = [0];
  const maxX: number[] = [0];
  const maxY: number[] = [0];
  const stack = new Int32Array(w * h);
  let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (comp[s]) continue;
    const lv = labels[s];
    const id = ++count;
    let sp = 0;
    stack[sp++] = s;
    comp[s] = id;
    let area = 0;
    let bx0 = w;
    let by0 = h;
    let bx1 = 0;
    let by1 = 0;
    while (sp > 0) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      const y = (p - x) / w;
      if (x < bx0) bx0 = x;
      if (y < by0) by0 = y;
      if (x > bx1) bx1 = x;
      if (y > by1) by1 = y;
      if (x > 0 && !comp[p - 1] && labels[p - 1] === lv) {
        comp[p - 1] = id;
        stack[sp++] = p - 1;
      }
      if (x < w - 1 && !comp[p + 1] && labels[p + 1] === lv) {
        comp[p + 1] = id;
        stack[sp++] = p + 1;
      }
      if (y > 0 && !comp[p - w] && labels[p - w] === lv) {
        comp[p - w] = id;
        stack[sp++] = p - w;
      }
      if (y < h - 1 && !comp[p + w] && labels[p + w] === lv) {
        comp[p + w] = id;
        stack[sp++] = p + w;
      }
    }
    areas.push(area);
    levelOf.push(lv);
    minX.push(bx0);
    minY.push(by0);
    maxX.push(bx1);
    maxY.push(by1);
  }
  return { comp, count, areas: Int32Array.from(areas), levelOf: Int32Array.from(levelOf), minX: Int32Array.from(minX), minY: Int32Array.from(minY), maxX: Int32Array.from(maxX), maxY: Int32Array.from(maxY) };
}
