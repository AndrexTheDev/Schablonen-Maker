/**
 * Export-Paket: SVG, DXF, PNG, Druck-PDF, Anleitung, Projektdatei.
 */

import { zipSync, strToU8 } from 'fflate';
import { overviewToSvg, layerToSvg } from './core/export/svg';
import { layerToDxf } from './core/export/dxf';
import { buildPrintPdf } from './core/export/print';
import { paintRegistration, paintSolidSheet } from './core/render';
import { canvasToBlob, makeCanvas } from './core/image';
import type { PipelineResult, Settings } from './core/types';
import { mmToPx, pageSizeMm } from './core/units';

export interface ExportFormats {
  svg: boolean;
  svgCut: boolean;
  dxf: boolean;
  png: boolean;
  pdf: boolean;
  txt: boolean;
  project: boolean;
  pngTransparent: boolean;
}

export const DEFAULT_FORMATS: ExportFormats = {
  svg: true,
  svgCut: false,
  dxf: false,
  png: false,
  pdf: true,
  txt: true,
  project: true,
  pngTransparent: true,
};

export interface ExportRequest {
  result: PipelineResult;
  settings: Settings;
  formats: ExportFormats;
  /** Quellbild als data-URL (nur für die Projektdatei) */
  sourceDataUrl?: string;
  sourceName?: string;
  onProgress?: (msg: string, pct: number) => void;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const pad = (n: number) => String(n).padStart(2, '0');

export function layerFileName(result: PipelineResult, index: number) {
  const layer = result.layers[index];
  return `${pad(index + 1)}_${slug(layer.name)}`;
}

export async function renderLayerPng(
  result: PipelineResult,
  settings: Settings,
  index: number,
  transparent: boolean
): Promise<Blob> {
  const layer = result.layers[index];
  const dpi = settings.dpi;
  const margin = settings.marginMm;
  const canvas = makeCanvas(mmToPx(result.widthMm + 2 * margin, dpi), mmToPx(result.heightMm + 2 * margin, dpi));
  const ctx = canvas.getContext('2d')!;
  const t = {
    pxPerMm: dpi / 25.4,
    offsetXMm: margin,
    offsetYMm: margin,
    cropXMm: 0,
    cropYMm: 0,
    mmPerPx: result.mmPerPx,
  };
  if (transparent) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // Material schwarz, Öffnungen transparent/weiß
  const { contoursToPath } = await import('./core/render');
  const path = contoursToPath(layer, t);
  ctx.fillStyle = '#000000';
  ctx.fill(path, 'evenodd');
  if (settings.registration) {
    paintRegistration(ctx, t, result.widthMm, result.heightMm, { sizeMm: 4, color: '#000000' });
  }
  void paintSolidSheet;
  return canvasToBlob(canvas, 'image/png');
}

function instructionsText(result: PipelineResult, settings: Settings): string {
  const page = pageSizeMm(settings.paper, settings.orientation);
  const lines: string[] = [];
  lines.push('SCHABLONEN MAKER – ANLEITUNG');
  lines.push('============================');
  lines.push('');
  lines.push(`Motivgröße: ${settings.widthMm.toFixed(0)} x ${result.heightMm.toFixed(0)} mm`);
  lines.push(`Papier: ${settings.paper.toUpperCase()} (${page.w} x ${page.h} mm), ${settings.dpi} dpi`);
  lines.push(`Ebenen: ${result.layers.length} (Tonstufen gesamt: ${result.stats.tones})`);
  lines.push(`Arbeitsauflösung: ${result.width} x ${result.height} px (${result.stats.pxPerMm.toFixed(1)} px/mm)`);
  lines.push('');
  lines.push('SPRÜHREIHENFOLGE (hell -> dunkel)');
  result.layers.forEach((l, i) => {
    lines.push(
      `  ${i + 1}. ${l.name.padEnd(10)} ${l.color}  Pfade: ${String(l.stats.paths).padStart(4)}  Schnittlänge: ${l.stats.cutLengthMm.toFixed(0)} mm  Stege: ${l.stats.bridges}`
    );
    for (const w of l.stats.warnings) lines.push(`       ! ${w}`);
  });
  lines.push('');
  lines.push('ARBEITSSCHRITTE');
  lines.push('  1. Alle Seiten in 100 % drucken (keine Seitenanpassung).');
  lines.push('  2. Blätter über die Passmarken (Fadenkreuze) exakt ausrichten.');
  lines.push('  3. Graue Flächen ausschneiden, weiße Flächen bleiben stehen.');
  lines.push('  4. Stege nicht durchtrennen – sie halten die Inseln im Blech.');
  lines.push('  5. Von hell nach dunkel sprühen, jede Ebene trocknen lassen.');
  lines.push('');
  lines.push('DATEIEN');
  lines.push('  SVG/…      Vektoren in mm – Plotter, Laser, Cricut, Silhouette');
  lines.push('  DXF/…      Vektoren in mm für Laser/CNC (Y-Achse nach oben)');
  lines.push('  PNG/…      Raster in Druckauflösung');
  lines.push('  Druck_*.pdf  Fertige Druckseiten mit Passmarken');
  lines.push('');
  return lines.join('\r\n');
}

export async function buildExportZip(req: ExportRequest): Promise<Blob> {
  const { result, settings, formats } = req;
  const files: Record<string, Uint8Array> = {};
  const base = `schablonen-${slug(new Date().toISOString().slice(0, 10))}`;
  let step = 0;
  const totalSteps =
    2 +
    (formats.svg ? result.layers.length : 0) +
    (formats.svgCut ? result.layers.length : 0) +
    (formats.dxf ? result.layers.length : 0) +
    (formats.png ? result.layers.length : 0) +
    (formats.pdf ? 1 : 0);
  const tick = (msg: string) => {
    step++;
    req.onProgress?.(msg, Math.round((step / totalSteps) * 100));
  };

  const svgOpts = {
    marginMm: settings.marginMm,
    mmPerPx: result.mmPerPx,
    artWmm: result.widthMm,
    artHmm: result.heightMm,
    registration: settings.registration,
    labels: true,
    title: '',
    style: 'solid' as const,
  };

  files['00_Uebersicht.svg'] = strToU8(
    overviewToSvg(result.layers, { ...svgOpts, title: 'Übersicht aller Ebenen', labels: false })
  );
  tick('Übersicht');

  for (let i = 0; i < result.layers.length; i++) {
    const layer = result.layers[i];
    const name = layerFileName(result, i);
    if (formats.svg) {
      files[`SVG/${name}.svg`] = strToU8(
        layerToSvg(layer, {
          ...svgOpts,
          title: `Ebene ${i + 1} von ${result.layers.length} – ${layer.color}`,
          subtitle: `Sprühen: ${i + 1}. · Motiv ${result.widthMm.toFixed(0)} × ${result.heightMm.toFixed(0)} mm · Stege ${layer.stats.bridges}`,
        })
      );
      tick(`SVG ${i + 1}`);
    }
    if (formats.svgCut) {
      files[`SVG_Schnitt/${name}_schnitt.svg`] = strToU8(
        layerToSvg(layer, {
          ...svgOpts,
          style: 'cutlines',
          labels: false,
          title: `Ebene ${i + 1} – Schnittlinien`,
        })
      );
      tick(`Schnitt ${i + 1}`);
    }
    if (formats.dxf) {
      files[`DXF/${name}.dxf`] = strToU8(layerToDxf(layer, result.mmPerPx, result.heightMm, 0));
      tick(`DXF ${i + 1}`);
    }
    if (formats.png) {
      const blob = await renderLayerPng(result, settings, i, formats.pngTransparent);
      files[`PNG/${name}.png`] = new Uint8Array(await blob.arrayBuffer());
      tick(`PNG ${i + 1}`);
    }
  }

  if (formats.pdf) {
    const page = pageSizeMm(settings.paper, settings.orientation);
    const blob = await buildPrintPdf(
      {
        settings,
        result,
        pageW: page.w,
        pageH: page.h,
        title: 'Schablonen Maker',
        fileName: base,
      },
      (done, total, label) => req.onProgress?.(`PDF: ${label} (${done}/${total})`, 90)
    );
    files['Druck_Schablonen.pdf'] = new Uint8Array(await blob.arrayBuffer());
    tick('PDF');
  }

  if (formats.txt) {
    files['ANLEITUNG.txt'] = strToU8(instructionsText(result, settings));
  }
  if (formats.project && req.sourceDataUrl) {
    files['projekt.schablone.json'] = strToU8(
      JSON.stringify(
        {
          format: 'schablonen-maker',
          version: 1,
          created: new Date().toISOString(),
          sourceName: req.sourceName ?? 'Bild',
          settings,
          image: req.sourceDataUrl,
        },
        null,
        1
      )
    );
  }

  const zipped = zipSync(files, { level: 6 });
  req.onProgress?.('Fertig', 100);
  return new Blob([zipped], { type: 'application/zip' });
}

/** Einzelne Formate (ohne ZIP) für schnelle Exporte. */
export async function exportSingle(
  result: PipelineResult,
  settings: Settings,
  kind: 'pdf' | 'svg' | 'png',
  layerIndex = 0
): Promise<{ name: string; blob: Blob }> {
  if (kind === 'pdf') {
    const page = pageSizeMm(settings.paper, settings.orientation);
    const blob = await buildPrintPdf({ settings, result, pageW: page.w, pageH: page.h, title: 'Schablonen Maker', fileName: 'schablonen' });
    return { name: 'Schablonen-Druck.pdf', blob };
  }
  if (kind === 'png') {
    const blob = await renderLayerPng(result, settings, layerIndex, true);
    return { name: `${layerFileName(result, layerIndex)}.png`, blob };
  }
  const layer = result.layers[layerIndex];
  const svg = layerToSvg(layer, {
    marginMm: settings.marginMm,
    mmPerPx: result.mmPerPx,
    artWmm: result.widthMm,
    artHmm: result.heightMm,
    style: 'solid',
    registration: settings.registration,
    labels: true,
    title: `Ebene ${layerIndex + 1} – ${layer.color}`,
  });
  return { name: `${layerFileName(result, layerIndex)}.svg`, blob: new Blob([svg], { type: 'image/svg+xml' }) };
}
