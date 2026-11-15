import type { Orientation, PaperId } from './types';

/** Papierformate in mm (Hochformat). */
export const PAPER_SIZES: Record<Exclude<PaperId, 'custom'>, { name: string; w: number; h: number }> = {
  a4: { name: 'A4', w: 210, h: 297 },
  a3: { name: 'A3', w: 297, h: 420 },
  a2: { name: 'A2', w: 420, h: 594 },
  letter: { name: 'Letter', w: 215.9, h: 279.4 },
  tabloid: { name: 'Tabloid', w: 279.4, h: 431.8 },
};

export function pageSizeMm(paper: PaperId, orientation: Orientation, customW = 210, customH = 297) {
  let w: number;
  let h: number;
  if (paper === 'custom') {
    w = customW;
    h = customH;
  } else {
    const p = PAPER_SIZES[paper];
    w = p.w;
    h = p.h;
  }
  return orientation === 'landscape' ? { w: h, h: w } : { w, h };
}

export const mmToPx = (mm: number, dpi: number) => (mm / 25.4) * dpi;
export const pxToMm = (px: number, dpi: number) => (px / dpi) * 25.4;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Formatiert mm für die Anzeige. */
export function fmtMm(v: number, digits = 1) {
  return `${v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} mm`;
}

/**
 * Aufteilung einer Fläche (w×h mm) in Druckseiten.
 * Liefert pro Seite den Quellbereich in mm.
 */
export interface Tile {
  index: number;
  col: number;
  row: number;
  cols: number;
  rows: number;
  /** Ausschnitt auf dem Kunstwerk in mm */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeTiles(
  artW: number,
  artH: number,
  pageW: number,
  pageH: number,
  marginMm: number,
  overlapMm: number
): { tiles: Tile[]; cols: number; rows: number; scale: number } {
  const usableW = Math.max(10, pageW - 2 * marginMm);
  const usableH = Math.max(10, pageH - 2 * marginMm);
  const cols = Math.max(1, Math.ceil((artW - overlapMm) / Math.max(1, usableW - overlapMm)));
  const rows = Math.max(1, Math.ceil((artH - overlapMm) / Math.max(1, usableH - overlapMm)));
  const tiles: Tile[] = [];
  const stepX = cols > 1 ? (artW - usableW) / (cols - 1) : 0;
  const stepY = rows > 1 ? (artH - usableH) / (rows - 1) : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.min(Math.max(0, c * stepX), Math.max(0, artW - usableW));
      const y = Math.min(Math.max(0, r * stepY), Math.max(0, artH - usableH));
      tiles.push({
        index: r * cols + c,
        col: c,
        row: r,
        cols,
        rows,
        x,
        y,
        w: Math.min(usableW, artW),
        h: Math.min(usableH, artH),
      });
    }
  }
  return { tiles, cols, rows, scale: 1 };
}
