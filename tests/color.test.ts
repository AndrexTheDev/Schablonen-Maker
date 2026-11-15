import { describe, expect, it } from 'vitest';
import { hexToRgb, perceptualTone, rgbToHex, rgbToLab, srgbToLinear } from '../src/core/color';

describe('Farbe', () => {
  it('bildet Helligkeit monoton ab (schwarz < grau < weiß)', () => {
    const black = perceptualTone(0, 0, 0);
    const gray = perceptualTone(128, 128, 128);
    const white = perceptualTone(255, 255, 255);
    expect(black).toBeLessThan(gray);
    expect(gray).toBeLessThan(white);
    expect(white).toBeCloseTo(255, 0);
    expect(black).toBeCloseTo(0, 0);
  });

  it('ist bei gesättigten Farben plausibel (Rot dunkler als Gelb)', () => {
    expect(perceptualTone(255, 0, 0)).toBeLessThan(perceptualTone(255, 255, 0));
    expect(perceptualTone(0, 0, 255)).toBeLessThan(perceptualTone(0, 255, 0));
  });

  it('linearisiert sRGB korrekt', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBeCloseTo(1, 6);
    expect(srgbToLinear(128)).toBeCloseTo(0.2158, 3);
  });

  it('wandelt Hex und RGB hin und zurück', () => {
    expect(hexToRgb('#f4f1ea')).toEqual([0xf4, 0xf1, 0xea]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(rgbToHex(27, 27, 27)).toBe('#1b1b1b');
  });

  it('liefert Lab-Werte mit L*=100 für Weiß', () => {
    const [L, a, b] = rgbToLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 0);
    expect(Math.abs(a)).toBeLessThan(1);
    expect(Math.abs(b)).toBeLessThan(1);
    expect(rgbToLab(0, 0, 0)[0]).toBeLessThan(1);
  });
});
