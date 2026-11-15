/**
 * Zeichnen von Schablonen auf Canvas (Vorschau, PNG-Export, Druck-PDF).
 * Vektorbasiert über Path2D, damit auch bei 600 dpi nichts ausfranst.
 */

import type { Layer } from './types';

export interface DrawTransform {
  /** Pixel pro mm */
  pxPerMm: number;
  /** Verschiebung in mm */
  offsetXMm: number;
  offsetYMm: number;
  /** Ursprung des Ausschnitts im Kunstwerk (mm) */
  cropXMm: number;
  cropYMm: number;
  /** Maßstab Kunstwerk-Pixel -> mm */
  mmPerPx: number;
}

export function contoursToPath(layer: Layer, t: DrawTransform): Path2D {
  const path = new Path2D();
  const s = t.mmPerPx * t.pxPerMm;
  const ox = (t.offsetXMm - t.cropXMm) * t.pxPerMm;
  const oy = (t.offsetYMm - t.cropYMm) * t.pxPerMm;
  for (const c of layer.contours) {
    const pts = c.pts;
    if (pts.length < 6) continue;
    path.moveTo(pts[0] * s + ox, pts[1] * s + oy);
    for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i] * s + ox, pts[i + 1] * s + oy);
    path.closePath();
  }
  return path;
}

/** Zeichnet das Material (schwarz) auf weißem Grund. */
export function paintSolidSheet(ctx: CanvasRenderingContext2D, layer: Layer, t: DrawTransform) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const path = contoursToPath(layer, t);
  ctx.fillStyle = '#000000';
  ctx.fill(path, 'evenodd');
  ctx.restore();
}

/**
 * Passmarken: Fadenkreuze an den Ecken des Kunstwerks.
 * Liegen im Rand, sind also immer Material.
 */
export function paintRegistration(
  ctx: CanvasRenderingContext2D,
  t: DrawTransform,
  artWmm: number,
  artHmm: number,
  opts: { sizeMm?: number; color?: string; lineMm?: number; label?: string } = {}
) {
  const size = opts.sizeMm ?? 5;
  const line = opts.lineMm ?? 0.35;
  const color = opts.color ?? '#000000';
  const pxPerMm = t.pxPerMm;
  const x0 = (t.offsetXMm - t.cropXMm) * pxPerMm;
  const y0 = (t.offsetYMm - t.cropYMm) * pxPerMm;
  const x1 = x0 + artWmm * pxPerMm;
  const y1 = y0 + artHmm * pxPerMm;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, line * pxPerMm);
  ctx.lineCap = 'butt';
  const cross = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(x - size * pxPerMm, y);
    ctx.lineTo(x + size * pxPerMm, y);
    ctx.moveTo(x, y - size * pxPerMm);
    ctx.lineTo(x, y + size * pxPerMm);
    ctx.stroke();
  };
  cross(x0, y0);
  cross(x1, y0);
  cross(x0, y1);
  cross(x1, y1);

  if (opts.label) {
    ctx.fillStyle = color;
    const fs = Math.max(6, 3.2 * pxPerMm);
    ctx.font = `${fs}px "Segoe UI", Arial, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(opts.label, x0, y0 - size * pxPerMm - 1.2 * pxPerMm);
  }
  ctx.restore();
}

/** Rahmen um das Kunstwerk (Schnittkante des Blechs). */
export function paintArtworkBorder(
  ctx: CanvasRenderingContext2D,
  t: DrawTransform,
  artWmm: number,
  artHmm: number,
  color = '#9aa0a6'
) {
  const pxPerMm = t.pxPerMm;
  const x0 = (t.offsetXMm - t.cropXMm) * pxPerMm;
  const y0 = (t.offsetYMm - t.cropYMm) * pxPerMm;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 0.25 * pxPerMm);
  ctx.setLineDash([2 * pxPerMm, 2 * pxPerMm]);
  ctx.strokeRect(x0, y0, artWmm * pxPerMm, artHmm * pxPerMm);
  ctx.restore();
}

/** Maske als ImageData (1 = Farbe) – für schnelle Vorschauen. */
export function maskToImageData(
  mask: Uint8Array,
  w: number,
  h: number,
  fg: [number, number, number],
  bg: [number, number, number]
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < mask.length; i++) {
    const on = mask[i];
    data[i * 4] = on ? fg[0] : bg[0];
    data[i * 4 + 1] = on ? fg[1] : bg[1];
    data[i * 4 + 2] = on ? fg[2] : bg[2];
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, w, h);
}
