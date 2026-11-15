/**
 * Druck-PDF: seitenweise, maßstabsgetreu (mm), mit Passmarken,
 * Blattaufteilung für große Formate und einer Anleitungsseite.
 */

import { jsPDF } from 'jspdf';
import type { Layer, PipelineResult, Settings } from '../types';
import { computeTiles, mmToPx, PAPER_SIZES, pageSizeMm } from '../units';
import { paintArtworkBorder, paintRegistration, paintSolidSheet } from '../render';

export interface PrintOptions {
  layer: Layer;
  pageW: number;
  pageH: number;
  dpi: number;
  marginMm: number;
  artWmm: number;
  artHmm: number;
  mmPerPx: number;
  registration: boolean;
  overlapMm: number;
  labels: string;
}

export interface PrintJob {
  settings: Settings;
  result: PipelineResult;
  pageW: number;
  pageH: number;
  title: string;
  fileName: string;
}

function makeCanvas(wPx: number, hPx: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(wPx));
  c.height = Math.max(1, Math.round(hPx));
  return c;
}

/** Rendert eine Druckseite einer Ebene und liefert ein PNG-dataURL. */
export function renderPrintPage(opts: PrintOptions): string {
  const pxPerMm = opts.dpi / 25.4;
  const canvas = makeCanvas(mmToPx(opts.pageW, opts.dpi), mmToPx(opts.pageH, opts.dpi));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { tiles } = computeTiles(
    opts.artWmm,
    opts.artHmm,
    opts.pageW,
    opts.pageH,
    opts.marginMm,
    opts.overlapMm
  );
  const tile = tiles[0];
  const usableW = opts.pageW - 2 * opts.marginMm;
  const usableH = opts.pageH - 2 * opts.marginMm;
  const offsetX = opts.marginMm + Math.max(0, (usableW - tile.w) / 2);
  const offsetY = opts.marginMm + Math.max(0, (usableH - tile.h) / 2);

  const t = {
    pxPerMm,
    offsetXMm: offsetX,
    offsetYMm: offsetY,
    cropXMm: tile.x,
    cropYMm: tile.y,
    mmPerPx: opts.mmPerPx,
  };
  paintSolidSheet(ctx, opts.layer, t);
  paintArtworkBorder(ctx, t, tile.w, tile.h);
  if (opts.registration) {
    paintRegistration(ctx, t, tile.w, tile.h, {
      sizeMm: 4,
      label: opts.labels,
    });
  }
  return canvas.toDataURL('image/png');
}

/**
 * Baut das komplette Druck-PDF: Anleitungsseite + alle Ebenen, alle Blätter.
 */
export async function buildPrintPdf(
  job: PrintJob,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<Blob> {
  const { result, settings, pageW, pageH } = job;
  const { tiles } = computeTiles(result.widthMm, result.heightMm, pageW, pageH, settings.marginMm, settings.tileOverlapMm);
  const dpi = settings.dpi;
  const pdf = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: pageW > pageH ? 'landscape' : 'portrait' });
  pdf.setFont('helvetica', 'normal');

  let first = true;
  const total = result.layers.length * tiles.length + 1;
  let done = 0;
  const tick = (label: string) => {
    done++;
    onProgress?.(done, total, label);
  };

  /* ---------- Anleitungsseite ---------- */
  drawInstructions(pdf, job, pageW, pageH);
  tick('Anleitung');
  first = false;

  /* ---------- Ebenen ---------- */
  for (const layer of result.layers) {
    for (const tile of tiles) {
      if (!first) pdf.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait');
      first = false;
      const pxPerMm = dpi / 25.4;
      const canvas = makeCanvas(mmToPx(pageW, dpi), mmToPx(pageH, dpi));
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const usableW = pageW - 2 * settings.marginMm;
      const usableH = pageH - 2 * settings.marginMm;
      const offsetX = settings.marginMm + Math.max(0, (usableW - tile.w) / 2);
      const offsetY = settings.marginMm + Math.max(0, (usableH - tile.h) / 2);
      const t = {
        pxPerMm,
        offsetXMm: offsetX,
        offsetYMm: offsetY,
        cropXMm: tile.x,
        cropYMm: tile.y,
        mmPerPx: result.mmPerPx,
      };
      paintSolidSheet(ctx, layer, t);
      paintArtworkBorder(ctx, t, tile.w, tile.h);
      if (settings.registration) {
        const labels =
          tiles.length > 1
            ? `Ebene ${layer.order + 1}/${result.layers.length} · Blatt ${tile.index + 1}/${tiles.length} · x ${tile.x.toFixed(
                0
              )}–${(tile.x + tile.w).toFixed(0)} mm · y ${tile.y.toFixed(0)}–${(tile.y + tile.h).toFixed(0)} mm`
            : `Ebene ${layer.order + 1}/${result.layers.length} · ${settings.widthMm.toFixed(0)} × ${result.heightMm.toFixed(
                0
              )} mm`;
        paintRegistration(ctx, t, tile.w, tile.h, { sizeMm: 4, label: labels });
      }
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
      tick(`${layer.name}`);
    }
  }
  return pdf.output('blob');
}

function drawInstructions(pdf: jsPDF, job: PrintJob, pageW: number, pageH: number) {
  const { result, settings } = job;
  const m = Math.max(14, settings.marginMm + 6);
  let y = m;
  const line = (txt: string, size = 10, gap = 5.2, bold = false) => {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.text(txt, m, y);
    y += gap;
  };
  const wrap = (txt: string, size = 9.5, widthMm = pageW - 2 * m) => {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(txt, widthMm) as string[];
    for (const l of lines) {
      pdf.text(l, m, y);
      y += size * 0.48;
    }
    y += 2;
  };

  line('Schablonen Maker', 20, 9, true);
  line('Mehrlagige Sprühschablone (Banksy-Stil) – Schnittvorlage', 11, 8);
  line(`Erstellt: ${new Date().toLocaleDateString('de-DE')}`, 9, 5);
  line(`Motivgröße: ${settings.widthMm.toFixed(0)} × ${result.heightMm.toFixed(0)} mm`, 9, 5);
  const paperName =
    settings.paper === 'custom' ? 'eigenes Format' : `${PAPER_SIZES[settings.paper as keyof typeof PAPER_SIZES]?.name} (${pageSizeMm(settings.paper, settings.orientation).w} × ${pageSizeMm(settings.paper, settings.orientation).h} mm)`;
  line(`Papier: ${paperName} · ${settings.dpi} dpi · Rand ${settings.marginMm} mm`, 9, 8);

  line('Ebenen in Sprühreihenfolge (hell → dunkel)', 12, 7, true);
  result.layers.forEach((layer, i) => {
    const [r, g, b] = hex(layer.color);
    pdf.setFillColor(r, g, b);
    pdf.rect(m, y - 3.2, 6, 4, 'F');
    pdf.setDrawColor(60, 60, 60);
    pdf.rect(m, y - 3.2, 6, 4, 'S');
    pdf.setFontSize(9.5);
    pdf.setFont('helvetica', 'normal');
    const info = `${i + 1}. ${layer.name}  ${layer.color.toUpperCase()}   Pfade: ${layer.stats.paths}   Schnittlänge: ${layer.stats.cutLengthMm.toFixed(
      0
    )} mm   Stege: ${layer.stats.bridges}`;
    pdf.text(info, m + 9, y);
    y += 5.6;
  });
  y += 4;

  line('So arbeitest du damit', 12, 7, true);
  const steps = [
    '1. Alle Seiten in 100 % (nicht „an Seite anpassen“) auf 120–200 g Karton oder Overhead-Folie drucken.',
    '2. Die Blätter mit den Passmarken (Fadenkreuze) exakt übereinanderlegen – die Marken liegen außerhalb des Motivs.',
    '3. Graue Flächen ausschneiden: die weißen Flächen bleiben stehen. Mit Skalpell/Cutter entlang der Konturen, Innenflächen zuerst.',
    '4. Stege (dünne Materialstreifen) NICHT durchtrennen – sie halten die Inseln im Blech.',
    '5. Von Ebene 1 (hell) nach Ebene n (dunkel) sprühen. Zwischen den Ebenen trocknen lassen, sonst verschmiert die Passung.',
    '6. Die Schablone 2–3 mm über der Wand halten: scharfe Kante statt Sprühnebel.',
  ];
  for (const s of steps) wrap(s, 9.5);
  y += 2;

  line('Parameter', 11, 6, true);
  const params = [
    `Tonstufen: ${result.stats.tones} (Papier = hellster Ton: ${settings.paperAsLightest ? 'ja' : 'nein'})`,
    `Modell: ${settings.model === 'separate' ? 'separate Blätter je Ebene' : 'kumulativ (ineinandergeschnitten)'}`,
    `Arbeitsauflösung: ${result.width} × ${result.height} px (${result.stats.pxPerMm.toFixed(1)} px/mm)`,
    `Stegbreite: ${settings.bridgeMm} mm · Mindestöffnung: ${settings.minHoleMm} mm · Mindestdetail: ${settings.minFeatureMm} mm`,
  ];
  for (const p of params) wrap(p, 9);
  y += 2;

  const warn = result.layers.flatMap((l) => l.stats.warnings.map((w) => `${l.name}: ${w}`));
  if (warn.length) {
    line('Hinweise', 11, 6, true);
    for (const w of warn) wrap('• ' + w, 9);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text('Erzeugt mit Schablonen Maker – alle Berechnungen lokal auf diesem Rechner.', m, pageH - 8);
}

function hex(color: string): [number, number, number] {
  const h = color.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
