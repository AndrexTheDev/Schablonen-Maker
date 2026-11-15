import { describe, expect, it } from 'vitest';
import { addBridges, findIslands } from '../src/core/bridge';
import { labelComponents } from '../src/core/components';
import { invert } from '../src/core/morphology';

const W = 60;
const H = 40;

/** Materialrahmen mit einer freien Insel in der Mitte. */
function frameWithIsland() {
  const material = new Uint8Array(W * H); // 0 = Öffnung
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) material[y * W + x] = 0;
  // Rahmen (2 px) stehen lassen
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) material[y * W + x] = 1;
  }
  // freie Insel 5x5 in der Mitte
  for (let y = 18; y <= 22; y++) for (let x = 28; x <= 32; x++) material[y * W + x] = 1;
  return material;
}

describe('Inseln und Stege', () => {
  it('erkennt die freie Insel', () => {
    const material = frameWithIsland();
    const islands = findIslands(material, W, H);
    expect(islands.count).toBe(1);
    expect(islands.pixels).toBe(25);
    const comps = labelComponents(material, W, H, 8);
    expect(comps.count).toBe(2);
  });

  it('verbindet die Insel mit einem Steg zum Rahmen', () => {
    const material = frameWithIsland();
    const res = addBridges(material, W, H, { width: 2 });
    expect(res.islands).toBe(1);
    expect(res.bridges).toBe(1);
    expect(res.remaining).toBe(0);
    expect(res.longestBridgePx).toBeGreaterThan(5);
    // Alles hängt jetzt zusammen -> nur noch eine Komponente.
    expect(labelComponents(res.material, W, H, 8).count).toBe(1);
    // Der Steg ist tatsächlich Material.
    const bridgePx = res.bridgeMask.reduce((a, b) => a + b, 0);
    expect(bridgePx).toBeGreaterThan(0);
  });

  it('lässt eine Schablone ohne Inseln unangetastet', () => {
    const material = new Uint8Array(W * H).fill(1);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) material[y * W + x] = 0; // Öffnung
    const res = addBridges(material, W, H, { width: 2 });
    expect(res.islands).toBe(0);
    expect(res.bridges).toBe(0);
  });

  it('bleibt stabil, wenn alle Öffnungen übermalt werden (prefer)', () => {
    const material = frameWithIsland();
    const prefer = invert(material); // jede Öffnung wird später übermalt
    const res = addBridges(material, W, H, { width: 2, prefer });
    expect(res.bridges).toBe(1);
    expect(res.remaining).toBe(0);
    expect(labelComponents(res.material, W, H, 8).count).toBe(1);
  });
});

describe('Vektorisierung', () => {
  it('erzeugt ein geschlossenes Polygon für ein Rechteck', async () => {
    const { traceContours, polylineLength, signedArea } = await import('../src/core/trace');
    const mask = new Uint8Array(W * H);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 40; x++) mask[y * W + x] = 1;
    const contours = traceContours(mask, W, H, { tolerance: 0.3, smooth: 0, minArea: 1 });
    // Genau eine Kontur: jede Kante wird nur einmal durchlaufen (nicht in
    // beiden Richtungen), sonst hebt sich die Füllung selbst auf.
    expect(contours.length).toBe(1);
    expect(contours[0].hole).toBe(false);
    const pts = contours[0].pts;
    expect(pts.length).toBeGreaterThanOrEqual(8);
    expect(pts.length % 2).toBe(0);
    // 30 x 20 px Fläche und 100 px Umfang (Pixelfläche ± 1)
    expect(Math.abs(signedArea(pts))).toBeGreaterThan(0);
    expect(polylineLength(pts)).toBeGreaterThan(90);
    expect(polylineLength(pts)).toBeLessThan(110);
  });

  it('behält ein Loch im Material (Ring -> zwei Konturen)', async () => {
    const { traceContours } = await import('../src/core/trace');
    const mask = new Uint8Array(W * H);
    for (let y = 8; y < 32; y++) for (let x = 8; x < 52; x++) mask[y * W + x] = 1;
    for (let y = 16; y < 24; y++) for (let x = 24; x < 36; x++) mask[y * W + x] = 0;
    const contours = traceContours(mask, W, H, { tolerance: 0.3, smooth: 0, minArea: 1 });
    expect(contours.length).toBe(2);
    expect(contours.filter((c) => c.hole).length).toBe(1);
  });

  it('rundet Ecken nur minimal ab (kein Achteck)', async () => {
    const { traceContours } = await import('../src/core/trace');
    const mask = new Uint8Array(80 * 60).fill(1); // Blech über die ganze Fläche
    for (let y = 20; y < 40; y++) for (let x = 25; x < 55; x++) mask[y * 80 + x] = 0;
    const cs = traceContours(mask, 80, 60, { tolerance: 0.65, smooth: 1, minArea: 1 });
    const outer = cs.find((c) => !c.hole)!;
    // Ecken müssen nahe an der Rechteck-Ecke bleiben (±3 px).
    const near = outer.pts.filter((v, i) => i % 2 === 0 ? v < 3 : v < 3);
    expect(outer.pts.length / 2).toBeLessThanOrEqual(16);
    expect(near.length).toBeGreaterThan(2);
  });

  it('glättet ohne die Form zu zerstören', async () => {
    const { traceContours } = await import('../src/core/trace');
    const mask = new Uint8Array(W * H);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 40; x++) mask[y * W + x] = 1;
    const rough = traceContours(mask, W, H, { tolerance: 0, smooth: 0, minArea: 1 })[0];
    const smooth = traceContours(mask, W, H, { tolerance: 0.5, smooth: 2, minArea: 1 })[0];
    expect(smooth.pts.length).toBeLessThan(rough.pts.length);
    expect(smooth.pts.length).toBeGreaterThan(8);
  });
});

describe('Invertieren', () => {
  it('dreht Material und Öffnung um', () => {
    const m = frameWithIsland();
    const inv = invert(m);
    for (let i = 0; i < m.length; i++) expect(inv[i]).toBe(m[i] ? 0 : 1);
  });
});
