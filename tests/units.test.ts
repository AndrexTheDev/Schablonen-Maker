import { describe, expect, it } from 'vitest';
import { clamp, computeTiles, mmToPx, pageSizeMm, pxToMm } from '../src/core/units';
import { deriveFromDetail, QUALITY_PX } from '../src/core/types';

describe('Einheiten', () => {
  it('rechnet mm in Pixel und zurück', () => {
    expect(mmToPx(25.4, 300)).toBeCloseTo(300, 6);
    expect(pxToMm(300, 300)).toBeCloseTo(25.4, 6);
    expect(pxToMm(mmToPx(12.3, 150), 150)).toBeCloseTo(12.3, 6);
  });

  it('kennt die Papierformate und dreht sie bei Querformat', () => {
    expect(pageSizeMm('a4', 'portrait')).toEqual({ w: 210, h: 297 });
    expect(pageSizeMm('a4', 'landscape')).toEqual({ w: 297, h: 210 });
    expect(pageSizeMm('custom', 'portrait', 300, 400)).toEqual({ w: 300, h: 400 });
  });

  it('begrenzt Werte', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('legt ein Motiv, das größer als das Papier ist, auf mehrere Kacheln', () => {
    const small = computeTiles(150, 200, 210, 297, 8, 10);
    expect(small.cols).toBe(1);
    expect(small.rows).toBe(1);
    expect(small.scale).toBeGreaterThan(0);
    const big = computeTiles(1000, 400, 210, 297, 8, 10);
    expect(big.cols).toBeGreaterThan(1);
    expect(big.tiles.length).toBe(big.cols * big.rows);
    // Jede Kachel liegt vollständig auf dem Kunstwerk.
    for (const t of big.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(1000.001);
      expect(t.y + t.h).toBeLessThanOrEqual(400.001);
    }
  });
});

describe('Feinheit -> Mindestmaße', () => {
  it('wird mit steigender Feinheit kleiner', () => {
    const grob = deriveFromDetail(20);
    const fein = deriveFromDetail(90);
    expect(fein.minFeatureMm).toBeLessThan(grob.minFeatureMm);
    expect(fein.minHoleMm).toBeLessThan(grob.minHoleMm);
    expect(fein.minStripMm).toBeLessThan(grob.minStripMm);
  });

  it('bleibt im plausiblen Bereich', () => {
    const d = deriveFromDetail(100);
    expect(d.minFeatureMm).toBeGreaterThan(0.4);
    expect(d.minStripMm).toBeGreaterThan(0.9);
    const g = deriveFromDetail(0);
    expect(g.minFeatureMm).toBeLessThan(7);
  });

  it('hat drei sinnvoll gestaffelte Arbeitsauflösungen', () => {
    expect(QUALITY_PX.schnell).toBeLessThan(QUALITY_PX.standard);
    expect(QUALITY_PX.standard).toBeLessThan(QUALITY_PX.hoch);
    expect(QUALITY_PX.standard).toBeGreaterThanOrEqual(1000);
  });
});
