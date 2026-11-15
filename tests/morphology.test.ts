import { describe, expect, it } from 'vitest';
import {
  count,
  dilateRect,
  distanceTransform,
  erodeRect,
  invert,
  thickenThin,
  union,
} from '../src/core/morphology';
import { labelComponents, labelRegions, mergeSmallRegions, rootLabels } from '../src/core/components';

const W = 40;
const H = 30;

function blank() {
  return new Uint8Array(W * H);
}
function set(m: Uint8Array, x: number, y: number, v = 1) {
  m[y * W + x] = v;
}
function get(m: Uint8Array, x: number, y: number) {
  return m[y * W + x];
}
function rect(m: Uint8Array, x0: number, y0: number, x1: number, y1: number, v = 1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(m, x, y, v);
}

describe('Morphologie', () => {
  it('dilatiert und erodiert mit Rechteck-Strukturelement', () => {
    const m = blank();
    set(m, 20, 15);
    const d = dilateRect(m, W, H, 2);
    expect(count(d)).toBe(25); // 5x5
    const e = erodeRect(d, W, H, 2);
    expect(count(e)).toBe(1);
    expect(get(e, 20, 15)).toBe(1);
  });

  it('Öffnen entfernt dünne Ausläufer, lässt die Fläche stehen', () => {
    const m = blank();
    rect(m, 10, 8, 20, 18);
    for (let x = 21; x < 34; x++) set(m, x, 13); // 1 px dünner Stiel
    const opened = dilateRect(erodeRect(m, W, H, 2), W, H, 2);
    expect(count(opened)).toBeLessThan(count(m));
    expect(count(opened)).toBeGreaterThan(0);
    expect(get(opened, 30, 13)).toBe(0); // Stiel weg
    expect(get(opened, 15, 13)).toBe(1); // Fläche bleibt
  });

  it('invertiert und vereinigt', () => {
    const m = blank();
    set(m, 1, 1);
    expect(count(invert(m))).toBe(W * H - 1);
    const a = blank();
    set(a, 1, 1);
    const b = blank();
    set(b, 2, 2);
    expect(count(union(a, b))).toBe(2);
  });

  it('misst den euklidischen Abstand zum nächsten Zielpixel', () => {
    const m = blank();
    for (let y = 10; y <= 20; y++) for (let x = 10; x <= 20; x++) set(m, x, y); // Block als Ziel
    const dt = distanceTransform(m, W, H, 1);
    expect(dt[15 * W + 15]).toBe(0); // im Ziel
    expect(dt[15 * W + 23]).toBeCloseTo(3, 5); // 3 px rechts der Kante
    expect(dt[15 * W + 5]).toBeCloseTo(5, 5); // 5 px links der Kante
    expect(dt[0]).toBeCloseTo(Math.hypot(10, 10), 4); // Ecke diagonal
  });

  it('verdickt dünne Linien, lässt Flächen aber nicht in Öffnungen wachsen', () => {
    const thin = blank();
    for (let x = 4; x < 36; x++) set(thin, x, 15); // 1 px dünne Linie
    const grownThin = thickenThin(thin, W, H, 5);
    expect(count(grownThin)).toBeGreaterThan(count(thin) * 3);

    const area = blank();
    rect(area, 4, 4, 18, 18);
    const grownArea = thickenThin(area, W, H, 5);
    // Fläche bleibt Fläche: keine Ausbeulung in die Umgebung
    expect(get(grownArea, 3, 10)).toBe(0);
    expect(get(grownArea, 4, 4)).toBe(1);
  });
});

describe('Zusammenhangskomponenten', () => {
  it('findet getrennte Flächen', () => {
    const m = blank();
    rect(m, 2, 2, 6, 6);
    rect(m, 20, 20, 24, 24);
    const comps = labelComponents(m, W, H, 8);
    expect(comps.count).toBe(2);
    // Keine Fläche berührt den Rand -> die größere wird Träger.
    const root = rootLabels(comps);
    expect(root.length).toBe(3);
    expect(root[1]).toBe(1);
    expect(root[2]).toBe(0);
  });

  it('unterscheidet 4er- und 8er-Zusammenhang', () => {
    const m = blank();
    set(m, 10, 10);
    set(m, 11, 11); // diagonal benachbart
    expect(labelComponents(m, W, H, 8).count).toBe(1);
    expect(labelComponents(m, W, H, 4).count).toBe(2);
  });

  it('gruppiert Tonflächen und ihre Ränder', () => {
    const labels = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) labels[y * W + x] = x < 20 ? 0 : 1;
    const reg = labelRegions(labels, W, H);
    expect(reg.count).toBe(2);
    expect(reg.areas[1] + reg.areas[2]).toBe(W * H);
    expect(reg.levelOf[1]).toBe(0);
    expect(reg.levelOf[2]).toBe(1);
  });

  it('verschluckt kleine Tonflächen in die dominante Nachbarstufe', () => {
    const labels = new Uint8Array(W * H).fill(1);
    // 2x2 Störung der Stufe 3 mitten in einer Stufe-1-Fläche
    for (let y = 14; y <= 15; y++) for (let x = 19; x <= 20; x++) labels[y * W + x] = 3;
    const merged = mergeSmallRegions(labels, W, H, 4, 30);
    expect(merged).toBeGreaterThan(0);
    expect(labels[14 * W + 19]).toBe(1);
  });

  it('lässt große Flächen in Ruhe', () => {
    const labels = new Uint8Array(W * H).fill(0);
    for (let y = 5; y < 25; y++) for (let x = 5; x < 15; x++) labels[y * W + x] = 2;
    const before = labels.slice();
    const merged = mergeSmallRegions(labels, W, H, 4, 50);
    expect(merged).toBe(0);
    expect(Array.from(labels)).toEqual(Array.from(before));
  });
});
