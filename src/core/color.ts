/** Farb-Hilfsfunktionen: Luma, sRGB, Lab, Hex, Paletten. */

const LIN_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  LIN_LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
/** L* (0..100) aus Y (0..1) als Tabelle. */
const L_LUT = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) {
  const y = i / 4096;
  L_LUT[i] = y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

export function srgbToLinearLut(c: number) {
  return LIN_LUT[c & 255];
}

export function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/** Relative Luminanz (0..1), wie sie das Auge sieht. */
export function luminance(r: number, g: number, b: number) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Perzeptueller Helligkeitswert 0..255 (Y -> L* -> skaliert).
 * Über Tabellen, weil dieser Ausdruck pro Pixel läuft (3x pow + cbrt wären
 * bei 2 Megapixeln der teuerste Schritt der ganzen Pipeline).
 */
export function perceptualTone(r: number, g: number, b: number) {
  const y = 0.2126 * LIN_LUT[r] + 0.7152 * LIN_LUT[g] + 0.0722 * LIN_LUT[b];
  const lstar = L_LUT[(y * 4096) | 0] ?? 100;
  return lstar > 100 ? 255 : (lstar / 100) * 255;
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // sRGB -> XYZ (D65)
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Grauwert -> Hex (für Vorschau-Paletten). */
export function grayHex(v: number) {
  return rgbToHex(v, v, v);
}

export function relativeLuminanceOfHex(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return luminance(r, g, b);
}
