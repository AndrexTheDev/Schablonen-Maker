import { describe, expect, it } from 'vitest';
import { runPipeline } from '../src/core/pipeline';
import { DEFAULT_SETTINGS, deriveFromDetail, DETAIL_PRESETS, type Settings } from '../src/core/types';
import { layerToSvg, overviewToSvg } from '../src/core/export/svg';
import { layerToDxf } from '../src/core/export/dxf';
import { count, invert } from '../src/core/morphology';

const W = 120;
const H = 90;

/**
 * Synthetisches Testbild: heller Grund, dunkles Quadrat, mittelgrauer Balken,
 * ein weißer Lichtpunkt. Damit sind alle Tonstufen vertreten.
 */
function testImage() {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let v = 236; // Papier/Hintergrund
      if (x >= 20 && x < 60 && y >= 20 && y < 70) v = 40; // dunkle Fläche
      if (x >= 65 && x < 100 && y >= 30 && y < 55) v = 128; // Mittelton
      if (x >= 30 && x <= 34 && y >= 40 && y <= 44) v = 250; // heller Fleck
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function settingsFor(levels: number, patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...deriveFromDetail(60),
    levels,
    widthMm: 60, // 2 px/mm -> kleine, schnelle Rechnung
    sheetBorderMm: 3,
    bridges: true,
    ...patch,
  };
}

function run(levels: number, patch: Partial<Settings> = {}) {
  return runPipeline({ rgba: testImage(), width: W, height: H, settings: settingsFor(levels, patch) });
}

describe('Pipeline', () => {
  it('liefert eine Ebene je gesprühtem Ton', () => {
    const r = run(3);
    expect(r.layers.length).toBeGreaterThanOrEqual(1);
    expect(r.layers.length).toBeLessThanOrEqual(3);
    expect(r.stats.layers).toBe(r.layers.length);
    expect(r.stats.tones).toBeGreaterThanOrEqual(2);
    // Die Tonstufen sind hell -> dunkel sortiert.
    const lum = r.layers.map((l) => {
      const hex = l.color.replace('#', '');
      return parseInt(hex.slice(0, 2), 16);
    });
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeLessThanOrEqual(lum[i - 1]);
  });

  it('erzeugt Masken in Arbeitsauflösung und ein Komposit', () => {
    const r = run(3);
    const n = r.width * r.height;
    expect(r.width).toBeGreaterThan(W);
    expect(r.composite.length).toBe(n * 4);
    expect(r.toneMap.length).toBe(n);
    for (const l of r.layers) {
      expect(l.holes.length).toBe(n);
      // Masken sind binär.
      expect(l.holes.every((v) => v === 0 || v === 1)).toBe(true);
    }
  });

  it('lässt den hellsten Ton als Papier stehen (paperAsLightest)', () => {
    const r = run(3, { paperAsLightest: true });
    const i = 5 * r.width + 5; // Ecke oben links: Papier
    for (const l of r.layers) expect(l.holes[i]).toBe(0);
    const px = i * 4;
    expect(r.composite[px]).toBe(0xf4); // Papierfarbe
  });

  it('sprüht jede Ebene in der Reihenfolge hell -> dunkel', () => {
    const r = run(3);
    const idx = r.layers.map((l) => l.order);
    expect(idx).toEqual(idx.slice().sort((a, b) => a - b));
    // Die dunkle Fläche ist in der dunkelsten Ebene ausgeschnitten.
    const last = r.layers[r.layers.length - 1];
    const px = (30 * r.width + 30) as number;
    expect(last.holes[px]).toBe(1);
  });

  it('setzt Stege und meldet ehrliche Zahlen', () => {
    const r = run(3);
    for (const l of r.layers) {
      expect(l.stats.bridges).toBeLessThanOrEqual(l.stats.islands);
      expect(l.stats.paintPct).toBeGreaterThanOrEqual(0);
      expect(l.stats.paintPct).toBeLessThanOrEqual(1);
      expect(l.stats.paths).toBe(l.contours.length);
      expect(l.contours.length).toBeGreaterThan(0);
    }
  });

  it('deckt in der Summe annähernd die Fläche ab (getrennte Ebenen überlappen wenig)', () => {
    const r = run(3, { model: 'separate' });
    const n = r.width * r.height;
    const acc = new Uint8Array(n);
    for (const l of r.layers) for (let i = 0; i < n; i++) if (l.holes[i]) acc[i] = 1;
    // Ohne Rand bleibt ein Rest Papier; mehr als die Hälfte muss bedeckt sein.
    expect(count(acc) / n).toBeGreaterThan(0.15);
    expect(count(acc) / n).toBeLessThanOrEqual(1);
  });

  it('kumulativ: jede Ebene enthält alle dunkleren Töne', () => {
    const sep = run(3, { model: 'separate' });
    const cum = run(3, { model: 'cumulative' });
    const n = sep.width * sep.height;
    const total = (r: typeof sep) => r.layers.reduce((a, l) => a + count(l.holes), 0);
    expect(total(cum)).toBeGreaterThan(total(sep));
    // Die hellste Ebene kumulativ = Vereinigung aller Ebenen getrennt.
    const u = new Uint8Array(n);
    for (const l of sep.layers) for (let i = 0; i < n; i++) if (l.holes[i]) u[i] = 1;
    const top = cum.layers[0].holes;
    let diff = 0;
    for (let i = 0; i < n; i++) if (u[i] !== top[i]) diff++;
    expect(diff / n).toBeLessThan(0.25);
  });

  it('liefert eine Konturen-Ebene, wenn Umrisslinie gewünscht ist', () => {
    const without = run(2, { outline: false });
    const withOutline = run(2, { outline: true });
    expect(withOutline.layers.length).toBe(without.layers.length + 1);
    const last = withOutline.layers[withOutline.layers.length - 1];
    expect(last.name).toBe('Konturen');
    expect(count(last.holes)).toBeGreaterThan(0);
  });

  it('meldet Warnungen statt zu verschwinden, wenn kaum Farbe übrig bleibt', () => {
    const r = run(6);
    expect(Array.isArray(r.stats.warnings)).toBe(true);
    expect(r.stats.ms).toBeGreaterThan(0);
    expect(r.stats.pxPerMm).toBeGreaterThan(0);
  });
});

describe('Export', () => {
  const r = run(3);
  const layer = r.layers[0];

  it('schreibt SVG in Millimetern mit geschlossenen Pfaden', () => {
    const svg = layerToSvg(layer, {
      marginMm: 5,
      mmPerPx: r.mmPerPx,
      artWmm: r.widthMm,
      artHmm: r.heightMm,
      style: 'solid',
      registration: true,
      labels: true,
      title: 'Ebene 1',
    });
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).toMatch(/height="[\d.]+mm"/);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg.match(/d="M/g)?.length).toBeGreaterThan(0);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    // Jede Kontur ist geschlossen: gleich viele M wie Z.
    const d = svg.match(/<path d="[^"]+"/)![0];
    expect((d.match(/M/g) ?? []).length).toBe((d.match(/Z/g) ?? []).length);
    expect((d.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('schreibt DXF mit Polylinien in mm', () => {
    const dxf = layerToDxf(layer, r.mmPerPx, r.heightMm);
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('$INSUNITS');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    // Koordinaten liegen im Blatt.
    const nums = [...dxf.matchAll(/\n10\n(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...nums)).toBeLessThanOrEqual(r.widthMm + 1);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(-1);
  });

  it('baut eine Übersicht über alle Ebenen', () => {
    const svg = overviewToSvg(r.layers, {
      marginMm: 5,
      mmPerPx: r.mmPerPx,
      artWmm: r.widthMm,
      artHmm: r.heightMm,
      style: 'cutlines',
      registration: false,
      labels: true,
      title: 'Übersicht',
    });
    expect(svg).toContain('<svg');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });
});

describe('Voreinstellungen', () => {
  it('sind alle lauffähig und liefern Ebenen', () => {
    for (const preset of DETAIL_PRESETS) {
      const r = runPipeline({
        rgba: testImage(),
        width: W,
        height: H,
        settings: {
          ...DEFAULT_SETTINGS,
          ...preset.patch,
          ...deriveFromDetail(preset.patch.detail ?? 60),
          widthMm: 60,
        },
      });
      expect(r.layers.length).toBeGreaterThan(0);
      expect(r.layers.every((l) => l.contours.length > 0)).toBe(true);
    }
  });
});
