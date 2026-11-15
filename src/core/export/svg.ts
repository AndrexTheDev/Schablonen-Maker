/**
 * SVG-Export in Millimetern – die Grundlage für Plotter, Laser
 * (LightBurn, RDWorks), Cricut Design Space, Silhouette Studio,
 * Inkscape und Illustrator.
 */

import type { Layer } from '../types';

export interface SvgOptions {
  /** Rand um das Kunstwerk in mm */
  marginMm: number;
  mmPerPx: number;
  artWmm: number;
  artHmm: number;
  /** 'solid' = gefülltes Blech, 'cutlines' = nur Schnittlinien */
  style: 'solid' | 'cutlines';
  registration: boolean;
  /** Beschriftung (Ebene, Farbe, Reihenfolge) */
  labels: boolean;
  title: string;
  subtitle?: string;
}

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

function contoursToPathData(layer: Layer, mmPerPx: number, ox: number, oy: number): string {
  const parts: string[] = [];
  for (const c of layer.contours) {
    const pts = c.pts;
    if (pts.length < 6) continue;
    let d = `M${f2(pts[0] * mmPerPx + ox)} ${f2(pts[1] * mmPerPx + oy)}`;
    for (let i = 2; i < pts.length; i += 2) {
      d += `L${f2(pts[i] * mmPerPx + ox)} ${f2(pts[i + 1] * mmPerPx + oy)}`;
    }
    parts.push(d + 'Z');
  }
  return parts.join('');
}

export function layerToSvg(layer: Layer, opts: SvgOptions): string {
  const m = opts.marginMm;
  const w = opts.artWmm + 2 * m;
  const h = opts.artHmm + 2 * m;
  const path = contoursToPathData(layer, opts.mmPerPx, m, m);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${f2(w)}mm" height="${f2(h)}mm" viewBox="0 0 ${f2(
      w
    )} ${f2(h)}">`
  );
  lines.push(`<title>${escapeXml(opts.title)}</title>`);
  lines.push(`<desc>Schablonen Maker – ${escapeXml(layer.name)}, ${layer.contours.length} Pfade</desc>`);
  if (opts.style === 'solid') {
    lines.push(`<rect width="${f2(w)}" height="${f2(h)}" fill="#ffffff"/>`);
    lines.push(`<path d="${path}" fill="#111111" fill-rule="evenodd"/>`);
    if (opts.registration) {
      const s = 4;
      const crosses: string[] = [];
      const cross = (x: number, y: number) => {
        crosses.push(`<path d="M${f2(x - s)} ${f2(y)}H${f2(x + s)}M${f2(x)} ${f2(y - s)}V${f2(y + s)}"/>`);
      };
      cross(m, m);
      cross(m + opts.artWmm, m);
      cross(m, m + opts.artHmm);
      cross(m + opts.artWmm, m + opts.artHmm);
      lines.push(`<g fill="none" stroke="#000000" stroke-width="0.35">${crosses.join('')}</g>`);
    }
    if (opts.labels) {
      const fs = Math.min(6, m * 0.75);
      lines.push(
        `<g font-family="Segoe UI, Arial, sans-serif" font-size="${f2(fs)}" fill="#000000">` +
          `<text x="${f2(m)}" y="${f2(m - 1.6)}">${escapeXml(opts.title)}</text>` +
          (opts.subtitle
            ? `<text x="${f2(m)}" y="${f2(m + opts.artHmm + 3)}">${escapeXml(opts.subtitle)}</text>`
            : '') +
          `<text x="${f2(w - m)}" y="${f2(h - m + 4)}" text-anchor="end" font-size="${f2(fs * 1.3)}">${
            layer.order + 1
          }</text>` +
          `</g>`
      );
    }
  } else {
    lines.push(`<g fill="none" stroke="#ff0000" stroke-width="0.1" stroke-linejoin="round">`);
    lines.push(`<path d="${path}"/>`);
    lines.push('</g>');
    if (opts.registration) {
      const s = 4;
      const crosses: string[] = [];
      const cross = (x: number, y: number) => {
        crosses.push(`<path d="M${f2(x - s)} ${f2(y)}H${f2(x + s)}M${f2(x)} ${f2(y - s)}V${f2(y + s)}"/>`);
      };
      cross(m, m);
      cross(m + opts.artWmm, m);
      cross(m, m + opts.artHmm);
      cross(m + opts.artWmm, m + opts.artHmm);
      lines.push(`<g fill="none" stroke="#0000ff" stroke-width="0.1">${crosses.join('')}</g>`);
    }
  }
  lines.push('</svg>');
  return lines.join('\n');
}

/** Übersichts-SVG: alle Ebenen übereinander mit Ebenennummern. */
export function overviewToSvg(layers: Layer[], opts: SvgOptions): string {
  const m = opts.marginMm;
  const w = opts.artWmm + 2 * m;
  const h = opts.artHmm + 2 * m;
  const body = layers
    .map((l) => {
      const d = contoursToPathData(l, opts.mmPerPx, m, m);
      return `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="0.2" fill-rule="evenodd"/>`;
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${f2(w)}mm" height="${f2(h)}mm" viewBox="0 0 ${f2(
      w
    )} ${f2(h)}">`,
    `<title>${escapeXml(opts.title)}</title>`,
    `<rect width="${f2(w)}" height="${f2(h)}" fill="#ffffff"/>`,
    body,
    '</svg>',
  ].join('\n');
}

export function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}
