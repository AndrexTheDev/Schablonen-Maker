/**
 * Prüf-Skript: rechnet Beispielbilder durch die Pipeline und legt
 * PNG/SVG-Ergebnisse in tmp/verify/ ab. Damit lässt sich die Qualität der
 * Algorithmen ohne Klicken im UI beurteilen.
 *
 *   npm run verify -- samples/portrait.jpg 3
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { runPipeline } from '../src/core/pipeline';
import { DEFAULT_SETTINGS, DETAIL_PRESETS, deriveFromDetail, type Settings } from '../src/core/types';
import { layerToSvg, overviewToSvg } from '../src/core/export/svg';
import { layerToDxf } from '../src/core/export/dxf';

let OUT = path.join('tmp', 'verify');

async function loadImage(file: string, width: number) {
  const img = sharp(file).rotate().resize({ width, kernel: 'lanczos3' }).ensureAlpha().raw();
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function writeRgba(file: string, rgba: Uint8ClampedArray, w: number, h: number) {
  await sharp(Buffer.from(rgba), { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
}

function materialOf(holes: Uint8Array) {
  const m = new Uint8Array(holes.length);
  for (let i = 0; i < m.length; i++) m[i] = holes[i] ? 0 : 255;
  return m;
}

async function main() {
  const file = process.argv[2] ?? 'samples/portrait.jpg';
  const levels = Number(process.argv[3] ?? 3);
  const workWidth = Number(process.argv[4] ?? 1500);
  await fs.mkdir(OUT, { recursive: true });
  const img = await loadImage(file, workWidth);
  console.log(`Bild: ${file} ${img.width}x${img.height}`);

  const preset = DETAIL_PRESETS.find((p) => p.patch.levels === levels) ?? DETAIL_PRESETS[2];
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...preset.patch,
    ...deriveFromDetail(preset.patch.detail ?? DEFAULT_SETTINGS.detail),
    widthMm: 210,
    ...(process.env.PATCH ? (JSON.parse(process.env.PATCH) as Partial<Settings>) : {}),
  };
  if (process.env.OUT) (OUT as string) = String(process.env.OUT);

  const t0 = Date.now();
  const result = runPipeline({ ...img, settings });
  const ms = Date.now() - t0;
  console.log(`Pipeline: ${ms} ms, ${result.layers.length} Ebenen, ${result.stats.tones} Tonstufen, ${result.stats.pxPerMm.toFixed(1)} px/mm`);
  console.log(`Warnungen: ${result.stats.warnings.join(' | ') || '–'}`);
  console.log('  Zeiten: ' + result.stats.timings.map((t) => `${t.name}=${t.ms}ms`).join(' '));

  const base = path.join(OUT, `L${levels}`);
  await writeRgba(`${base}-composite.png`, result.composite, result.width, result.height);
  await sharp(Buffer.from(result.original), { raw: { width: result.width, height: result.height, channels: 4 } })
    .png()
    .toFile(`${base}-original.png`);

  for (let i = 0; i < result.layers.length; i++) {
    const l = result.layers[i];
    const m = materialOf(l.holes);
    await sharp(Buffer.from(m), { raw: { width: result.width, height: result.height, channels: 1 } })
      .png()
      .toFile(`${base}-layer${i + 1}.png`);
    const svg = layerToSvg(l, {
      marginMm: 8,
      mmPerPx: result.mmPerPx,
      artWmm: result.widthMm,
      artHmm: result.heightMm,
      style: 'solid',
      registration: true,
      labels: true,
      title: `Ebene ${i + 1} · ${l.color}`,
      subtitle: `Sprühen ${i + 1} · ${l.stats.bridges} Stege`,
    });
    await fs.writeFile(`${base}-layer${i + 1}.svg`, svg);
    await fs.writeFile(`${base}-layer${i + 1}.dxf`, layerToDxf(l, result.mmPerPx, result.heightMm));
    // SVG -> PNG (prüft, ob die Pfade überhaupt rendern)
    try {
      await sharp(Buffer.from(svg)).resize({ width: 900 }).png().toFile(`${base}-layer${i + 1}-svg.png`);
    } catch (e) {
      console.log('SVG-Rasterisierung nicht möglich:', (e as Error).message);
    }
    console.log(
      `  ${l.name} ${l.color}  Pfade=${l.stats.paths} Schnitt=${l.stats.cutLengthMm.toFixed(0)}mm Inseln=${l.stats.islands} Stege=${l.stats.bridges} Farbe=${(l.stats.paintPct * 100).toFixed(1)}%  ${l.stats.warnings.join('; ')}`
    );
  }
  await fs.writeFile(
    `${base}-uebersicht.svg`,
    overviewToSvg(result.layers, {
      marginMm: 8,
      mmPerPx: result.mmPerPx,
      artWmm: result.widthMm,
      artHmm: result.heightMm,
      style: 'solid',
      registration: false,
      labels: false,
      title: 'Übersicht',
    })
  );
  console.log(`Fertig in ${path.resolve(OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
