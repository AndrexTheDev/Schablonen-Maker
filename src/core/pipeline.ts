/**
 * Bild -> Schablonen-Pipeline.
 *
 *   1. Vorverarbeitung   Hintergrund, Materialrand, perzeptuelle Helligkeit, Glättung
 *   2. Tonwertzerlegung  k-Means (1D für Schwarzweiß, Lab für Farbe) + Modusfilter
 *   3. Ebenen            je Tonstufe eine Maske (separat oder kumulativ)
 *   4. Schneidbarkeit    Mindestöffnung, Mindeststeg, Sprenkel entfernen
 *   5. Topologie         Inseln erkennen + Stege setzen
 *   6. Vektorisierung    Konturen (SVG/DXF) + Statistik
 */

import { backgroundMask, bilateral, canny, downsample2, gradeTone, upsampleBilinear } from './filters';
import { hexToRgb, perceptualTone, rgbToHex } from './color';
import { count, dilateDisc, invert, thickenThin } from './morphology';
import { assignLevels, kmeans1d, kmeansLab, labToRgb, refineLabels, thresholds } from './quantize';
import { polylineLength, traceContours } from './trace';
import { addBridges } from './bridge';
import { mergeSmallRegions, removeSmallComponents } from './components';
import { PALETTES } from './types';
import type { Layer, LayerStats, PipelineResult, Settings } from './types';
import { clamp } from './units';

export interface PipelineInput {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  settings: Settings;
}

/** Farben der Sprühebenen (Index 0 = hellste/erste Ebene). */
export function resolveColors(settings: Settings, fallback: string[], countNeeded: number): string[] {
  const paletteKey = settings.palette || 'banksy';
  const palette = PALETTES[paletteKey]?.colors ?? PALETTES.banksy.colors;
  const out: string[] = [];
  for (let i = 0; i < countNeeded; i++) {
    const custom = settings.layerColors?.[i];
    if (custom && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(custom)) out.push(custom);
    else if (paletteKey === 'auto' && fallback[i]) out.push(fallback[i]);
    else out.push(palette[Math.min(palette.length - 1, i)] ?? fallback[i] ?? '#000000');
  }
  return out;
}

export function runPipeline(input: PipelineInput): PipelineResult {
  const t0 = Date.now();
  const timings: { name: string; ms: number }[] = [];
  let tPrev = t0;
  const mark = (name: string) => {
    const now = Date.now();
    timings.push({ name, ms: now - tPrev });
    tPrev = now;
  };

  const { settings } = input;
  const srcW = input.width;
  const srcH = input.height;
  const warnings: string[] = [];
  const pxPerMm = srcW / Math.max(1, settings.widthMm);
  const mmPerPx = 1 / pxPerMm;

  /* ---------------- 1. Vorverarbeitung ---------------- */
  const src = new Uint8ClampedArray(input.rgba);
  if (settings.removeBackground) {
    const bg = backgroundMask(src, srcW, srcH, settings.bgTolerance);
    for (let i = 0; i < srcW * srcH; i++) {
      if (!bg[i]) continue;
      src[i * 4] = 255;
      src[i * 4 + 1] = 255;
      src[i * 4 + 2] = 255;
    }
  }
  mark('Hintergrund');

  // Materialrand: ohne Rahmen zerfällt das Blech in Stücke, weil die Farbe
  // bis an den Bildrand reicht. Der Rand ist Papier = Material.
  const border = Math.max(2, Math.round(settings.sheetBorderMm * pxPerMm));
  const w = srcW + 2 * border;
  const h = srcH + 2 * border;
  const n = w * h;
  const rgba = new Uint8ClampedArray(n * 4).fill(255);
  for (let y = 0; y < srcH; y++) {
    const from = y * srcW * 4;
    const to = ((y + border) * w + border) * 4;
    rgba.set(src.subarray(from, from + srcW * 4), to);
  }
  mark('Rand');

  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) luma[i] = perceptualTone(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  const smoothAmount = clamp(settings.smoothing, 0, 100) / 100;
  const radius = Math.round(1 + smoothAmount * 6);
  const sigmaR = 8 + smoothAmount * 44;
  // Bei großen Bildern auf halber Auflösung glätten (4x schneller, optisch
  // gleichwertig, weil die Tonwertzerlegung danach ohnehin stark abstrahiert).
  let smoothed: Float32Array;
  if (n > 480000 && radius > 1) {
    const half = downsample2(luma, w, h);
    const sh = bilateral(half.data, half.w, half.h, Math.max(1, Math.round(radius / 2)), sigmaR);
    smoothed = upsampleBilinear(sh, half.w, half.h, w, h);
  } else {
    smoothed = bilateral(luma, w, h, radius, sigmaR);
  }
  const graded = gradeTone(smoothed, {
    contrast: settings.contrast,
    brightness: settings.brightness,
    invert: settings.invert,
    autoLevels: true,
  });
  mark('Glättung');

  /* ---------------- 2. Tonwertzerlegung ---------------- */
  const toneCount = clamp(Math.round(settings.levels) + (settings.paperAsLightest ? 1 : 0), 2, 8);
  const mode = settings.mode;

  // Konvention: level 0 = hellster Ton ... toneCount-1 = dunkelster Ton.
  // Gesprüht wird von hell nach dunkel, also aufsteigend im Level-Index.
  let levelMap = new Uint8Array(n);
  let clusterColors: string[] = new Array(toneCount).fill('#808080');

  if (mode === 'color') {
    const res = kmeansLab(rgba, w, h, toneCount);
    // kmeansLab liefert Cluster 0 = hellster
    for (let i = 0; i < n; i++) levelMap[i] = res.labels[i];
    clusterColors = new Array(toneCount);
    res.clusters.forEach((c, i) => {
      const [r, g, b] = labToRgb(c.L, c.a, c.b);
      clusterColors[i] = rgbToHex(r, g, b);
    });
  } else {
    const centers = kmeans1d(graded, toneCount); // aufsteigend: 0 = dunkelster
    const thr = thresholds(centers);
    const raw = assignLevels(graded, thr); // 0 = dunkelster
    for (let i = 0; i < n; i++) levelMap[i] = toneCount - 1 - raw[i];
    clusterColors = centers.map((c) => rgbToHex(c, c, c)).reverse();
  }
  mark('Quantisierung');

  // Modusfilter: glättet die Grenzen zwischen den Tonstufen, ohne Lücken zu
  // erzeugen (jeder Pixel behält genau eine Stufe).
  const refineR = clamp(Math.round(1 + smoothAmount * 2.5), 1, 3);
  levelMap = refineLabels(levelMap, w, h, toneCount, refineR);
  mark('Modusfilter');

  // Sprenkel entfernen: kleine Tonflächen verschwinden in ihrer Umgebung.
  // Das verhindert Punkte im Druck und unnötige Stege in den Ebenen.
  const minRegionPx = Math.max(6, Math.pow(settings.minFeatureMm * pxPerMm, 2) * 0.5);
  const merged = mergeSmallRegions(levelMap, w, h, toneCount, minRegionPx);
  if (merged > 0) warnings.push(`${merged} kleine Tonflächen zusammengefasst`);
  mark('Sprenkel');

  // Mittelwerte/Flächen pro Tonstufe
  const levelSum = new Float64Array(toneCount);
  const levelArea = new Uint32Array(toneCount);
  for (let i = 0; i < n; i++) {
    const l = levelMap[i];
    levelSum[l] += graded[i];
    levelArea[l]++;
  }

  /* ---------------- 3. Ebenen-Masken ---------------- */
  const toneMasks: Uint8Array[] = [];
  for (let level = 0; level < toneCount; level++) {
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (levelMap[i] === level) m[i] = 1;
    toneMasks.push(m);
  }

  // Sprühreihenfolge: hell -> dunkel. Papier = hellster Ton (nicht gesprüht)
  const paintLevels: number[] = [];
  for (let level = 0; level < toneCount; level++) {
    if (settings.paperAsLightest && level === 0) continue;
    paintLevels.push(level);
  }
  if (paintLevels.length === 0) paintLevels.push(toneCount - 1);

  const minAreaPx = Math.max(3, Math.pow(settings.minFeatureMm * pxPerMm, 2) * 0.7);
  const minFeaturePx = settings.minFeatureMm * pxPerMm;
  const minHolePx = settings.minHoleMm * pxPerMm;
  const minStripPx = settings.minStripMm * pxPerMm;
  const bridgePx = Math.max(1, Math.round(Math.max(settings.bridgeMm, settings.minStripMm) * pxPerMm));
  const spreadPx = settings.spreadMm * pxPerMm;
  const cumulative = settings.model === 'cumulative' && mode === 'mono';

  const rawMasks: Uint8Array[] = paintLevels.map((level) => {
    if (cumulative) {
      // Kumulativ: diese Schablone deckt ihren Ton und alle dunkleren ab.
      // Dadurch liegen die Öffnungen ineinander (keine Inseln, keine Stege).
      const m = new Uint8Array(n);
      for (let l = level; l < toneCount; l++) {
        const s = toneMasks[l];
        for (let i = 0; i < n; i++) if (s[i]) m[i] = 1;
      }
      return m;
    }
    return toneMasks[level].slice();
  });

  /* ---------------- 4. Schneidbarkeit je Ebene ---------------- */
  const preparedHoles: Uint8Array[] = rawMasks.map((raw, index) => {
    // Achtung: kleine Farbflächen NICHT einfach löschen – ein gelöschter
    // Farbtupfer wird zu Material und damit zu einer Insel, die einen
    // zusätzlichen Steg erzwingt. Sprenkel werden vorher auf der
    // Tonwertkarte der Nachbarstufe zugeschlagen (mergeSmallRegions).
    let holes = raw;
    // Zu schmale Farblinien auf die Mindestöffnung verbreitern (schneidbar)
    holes = thickenThin(holes, w, h, minHolePx);
    if (!cumulative && spreadPx > 0.4 && index > 0) {
      holes = dilateDisc(holes, w, h, Math.max(1, Math.round(spreadPx / 2)));
    }
    return holes;
  });
  mark('Schneidbarkeit');

  // Wer übermalt was? (nur Ebenen, die später gesprüht werden)
  const laterPaint: Uint8Array[] = new Array(preparedHoles.length);
  {
    const acc = new Uint8Array(n);
    for (let i = preparedHoles.length - 1; i >= 0; i--) {
      const m = preparedHoles[i];
      laterPaint[i] = acc.slice();
      for (let p = 0; p < n; p++) if (m[p]) acc[p] = 1;
    }
  }

  /* ---------------- 5.+6. Stege + Vektoren je Ebene ---------------- */
  const clusterFallback = paintLevels.map((level) => clusterColors[level] ?? '#000000');
  const colors = resolveColors(settings, clusterFallback, paintLevels.length);
  const layers: Layer[] = [];

  preparedHoles.forEach((holes, index) => {
    const level = paintLevels[index];
    let material = invert(holes);
    // Zu dünne Materialstege verstärken (Reißfestigkeit)
    material = thickenThin(material, w, h, minStripPx);
    // Materialflecken unterhalb der Mindestfläche lassen sich nicht
    // ausschneiden. Sie werden der Sprühfarbe zugeschlagen, statt sie mit
    // einem Steg zu halten – sonst ziehen sich Steg-Fäden über den ganzen
    // Hintergrund. Genau das macht auch der Mensch am Schneidetisch.
    if (settings.bridges) {
      const minIslandPx = Math.max(24, Math.round(minFeaturePx * minFeaturePx * 2.5));
      const cleaned = removeSmallComponents(material, w, h, minIslandPx, { keepTouchingBorder: true });
      if (cleaned.removed > 0) material = cleaned.mask;
    }

    let islands = 0;
    let bridgeCount = 0;
    let remaining = 0;
    let longestPx = 0;
    let islandMask: Uint8Array | undefined;
    let bridgeMask: Uint8Array | undefined;

    if (settings.bridges) {
      const res = addBridges(material, w, h, {
        width: bridgePx,
        prefer: laterPaint[index],
        maxPasses: 2,
      });
      material = res.material;
      islands = res.islands;
      bridgeCount = res.bridges;
      remaining = res.remaining;
      longestPx = res.longestBridgePx;
      islandMask = res.islandMask;
      bridgeMask = res.bridgeMask;
    }
    mark(`Stege ${index + 1}`);

    const holesFinal = invert(material);
    const contours = traceContours(material, w, h, {
      tolerance: 0.65,
      smooth: settings.smoothEdges ? 1 : 0,
      minArea: 1,
    });
    mark(`Vektoren ${index + 1}`);

    let cutLenPx = 0;
    for (const c of contours) cutLenPx += polylineLength(c.pts);
    const paintPct = count(holesFinal) / n;
    const layerWarnings: string[] = [];
    if (remaining > 0) layerWarnings.push(`${remaining} Insel(n) ohne Steg – würden herausfallen`);
    if (islands > 0 && !settings.bridges) layerWarnings.push(`${islands} Insel(n) – Stege sind aus`);
    if (longestPx * mmPerPx > 12) layerWarnings.push(`Langer Steg (${(longestPx * mmPerPx).toFixed(0)} mm)`);
    if (paintPct > 0.8) layerWarnings.push('Sehr große Öffnung – Blech wird instabil');
    if (paintPct < 0.003) layerWarnings.push('Kaum Farbe in dieser Ebene');

    const stats: LayerStats = {
      paintPct,
      cutLengthMm: cutLenPx * mmPerPx,
      paths: contours.length,
      islands,
      bridges: bridgeCount,
      warnings: layerWarnings,
    };

    const area = levelArea[level] || 1;
    layers.push({
      id: index,
      name: `Ebene ${index + 1}`,
      color: colors[index],
      tone: Math.round(levelSum[level] / area),
      holes: holesFinal,
      contours,
      stats,
      order: index,
      islands: islandMask,
      bridges: bridgeMask,
    });
  });

  /* ---------------- Konturen-Ebene (zuletzt gesprüht) ---------------- */
  if (settings.outline) {
    let edges = canny(graded, w, h, clamp(settings.outlineStrength, 0, 100));
    edges = removeSmallComponents(edges, w, h, Math.max(4, minAreaPx * 0.25), { keepTouchingBorder: true }).mask;
    const linePx = Math.max(1, settings.outlineMm * pxPerMm);
    if (linePx > 1.5) edges = dilateDisc(edges, w, h, Math.round(linePx / 2));
    let material = invert(edges);
    let islands = 0;
    let bridgeCount = 0;
    let remaining = 0;
    let longestPx = 0;
    let islandMask: Uint8Array | undefined;
    let bridgeMask: Uint8Array | undefined;
    if (settings.bridges) {
      const res = addBridges(material, w, h, {
        width: Math.max(1, Math.round(bridgePx * 0.8)),
        maxPasses: 2,
      });
      material = res.material;
      islands = res.islands;
      bridgeCount = res.bridges;
      remaining = res.remaining;
      longestPx = res.longestBridgePx;
      islandMask = res.islandMask;
      bridgeMask = res.bridgeMask;
    }
    const holesFinal = invert(material);
    const contours = traceContours(material, w, h, { tolerance: 0.5, smooth: 1, minArea: 1 });
    let cutLenPx = 0;
    for (const c of contours) cutLenPx += polylineLength(c.pts);
    const layerWarnings: string[] = [];
    if (remaining > 0) layerWarnings.push(`${remaining} Insel(n) ohne Steg`);
    if (longestPx * mmPerPx > 8) layerWarnings.push('Lange Stege in der Konturen-Ebene');
    layers.push({
      id: layers.length,
      name: 'Konturen',
      color: colors[colors.length - 1] ?? '#000000',
      tone: 0,
      holes: holesFinal,
      contours,
      stats: {
        paintPct: count(holesFinal) / n,
        cutLengthMm: cutLenPx * mmPerPx,
        paths: contours.length,
        islands,
        bridges: bridgeCount,
        warnings: layerWarnings,
      },
      order: layers.length,
      islands: islandMask,
      bridges: bridgeMask,
    });
    mark('Konturen');
  }

  /* ---------------- Sprüh-Simulation ---------------- */
  const composite = new Uint8ClampedArray(n * 4);
  const [pr, pg, pb] = hexToRgb(settings.paperColor);
  for (let i = 0; i < n; i++) {
    composite[i * 4] = pr;
    composite[i * 4 + 1] = pg;
    composite[i * 4 + 2] = pb;
    composite[i * 4 + 3] = 255;
  }
  for (const layer of layers) {
    const [lr, lg, lb] = hexToRgb(layer.color);
    const holes = layer.holes;
    for (let i = 0; i < n; i++) {
      if (holes[i]) {
        composite[i * 4] = lr;
        composite[i * 4 + 1] = lg;
        composite[i * 4 + 2] = lb;
      }
    }
  }
  mark('Simulation');

  /* ---------------- Hinweise ---------------- */
  const emptyLayers = layers.filter((l) => l.stats.paintPct < 0.0008).length;
  if (emptyLayers > 0) warnings.push(`${emptyLayers} Ebene(n) fast leer – weniger Ebenen wählen`);
  if (layers.length > 6) warnings.push('Viele Ebenen: Passmarken sind Pflicht');
  if (pxPerMm < 3) warnings.push('Wenig Bildpunkte pro mm – Arbeitsqualität „Hoch“ wählen');

  return {
    width: w,
    height: h,
    mmPerPx,
    widthMm: w * mmPerPx,
    heightMm: h * mmPerPx,
    artWidthMm: srcW * mmPerPx,
    artHeightMm: srcH * mmPerPx,
    layers,
    composite,
    toneMap: levelMap,
    original: rgba,
    stats: {
      ms: Date.now() - t0,
      timings,
      tones: toneCount,
      layers: layers.length,
      workW: w,
      workH: h,
      pxPerMm,
      warnings,
    },
  };
}
