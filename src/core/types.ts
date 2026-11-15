/**
 * Zentrale Typen des Schablonen-Compilers.
 * Alles hier ist reines, serialisierbares Datenmaterial, damit der
 * komplette Bildpfad in einem Web Worker laufen kann.
 */

export type StencilMode = 'mono' | 'color';
export type StencilModel = 'separate' | 'cumulative';
export type Orientation = 'portrait' | 'landscape';
export type PaperId = 'a4' | 'a3' | 'a2' | 'letter' | 'tabloid' | 'custom';
export type Quality = 'schnell' | 'standard' | 'hoch';

export interface Settings {
  /* ---------- 1. Bild ---------- */
  /** Hintergrund automatisch freistellen (Flutfüllung vom Bildrand) */
  removeBackground: boolean;
  bgTolerance: number; // 0..100
  invert: boolean;
  brightness: number; // -100..100
  contrast: number; // 0..100 (50 = neutral)
  quality: Quality;

  /* ---------- 2. Detail ---------- */
  levels: number; // Anzahl Schablonen (ohne Papier) 1..6
  mode: StencilMode;
  paperAsLightest: boolean; // hellster Ton = Papier (kein Stencil)
  smoothing: number; // 0..100  (Kanten erhaltene Glättung)
  detail: number; // 0..100  (Feinheit: Mindestgrößen, Kanten)

  /* ---------- 3. Schablone ---------- */
  model: StencilModel;
  bridges: boolean;
  bridgeMm: number;
  minFeatureMm: number; // kleinste Insel/Detail
  minHoleMm: number; // kleinste ausgeschnittene Öffnung (Material-/Schneidergrenze)
  minStripMm: number; // kleinste Stegbreite im Material
  sheetBorderMm: number; // Materialrand um das Motiv (hält das Blech zusammen)
  spreadMm: number; // Farbübergriff / Überlappung der Ebenen
  smoothEdges: boolean;
  outline: boolean; // zusätzliche Konturen-Ebene (zuletzt gesprüht)
  outlineMm: number;
  outlineStrength: number; // 0..100

  /* ---------- 4. Ausgabe ---------- */
  widthMm: number; // physische Breite der Schablone
  paper: PaperId;
  orientation: Orientation;
  dpi: number; // 150 | 300 | 600
  marginMm: number;
  tileOverlapMm: number;
  registration: boolean;
  layerColors: string[];
  paperColor: string;
  palette: string;
}

export interface Contour {
  /** Flach: [x0,y0,x1,y1,...] in Arbeits-Pixeln */
  pts: number[];
  area: number;
  /** true = Loch im Material (Gegenuhrzeigersinn), false = Außenkante */
  hole: boolean;
}

export interface LayerStats {
  /** Fläche, durch die Farbe geht (Anteil an der Gesamtfläche, 0..1) */
  paintPct: number;
  /** Schnittlänge in mm */
  cutLengthMm: number;
  paths: number;
  /** Anzahl Material-Inseln, die ohne Steg herausfallen würden */
  islands: number;
  bridges: number;
  warnings: string[];
}

export interface Layer {
  id: number;
  name: string;
  /** Sprühfarbe dieser Ebene */
  color: string;
  /** Mittlerer Tonwert der Ebene (0..255) – nur Info */
  tone: number;
  /** 1 = Farbe geht durch (ausgeschnitten), 0 = Material bleibt stehen */
  holes: Uint8Array;
  /** 1 = Material (Schablonenblech) */
  contours: Contour[];
  stats: LayerStats;
  order: number;
  /** 1 = war eine Insel (Anzeige „Inseln“) */
  islands?: Uint8Array;
  /** 1 = automatisch gesetzter Steg (Anzeige „Stege“) */
  bridges?: Uint8Array;
}

export interface PipelineStats {
  ms: number;
  timings: { name: string; ms: number }[];
  tones: number;
  layers: number;
  workW: number;
  workH: number;
  pxPerMm: number;
  warnings: string[];
}

export interface PipelineResult {
  width: number;
  height: number;
  /** mm pro Arbeitspixel */
  mmPerPx: number;
  /** Gesamtbreite des Blechs in mm (inkl. Materialrand) */
  widthMm: number;
  heightMm: number;
  /** Nur das Motiv ohne Rand */
  artWidthMm: number;
  artHeightMm: number;
  layers: Layer[];
  /** Sprüh-Simulation (RGBA, Arbeitsauflösung) */
  composite: Uint8ClampedArray;
  /** Tonwertkarte (0..tones-1) für Vergleiche */
  toneMap: Uint8Array;
  /** Original (nach Vorverarbeitung) als RGBA */
  original: Uint8ClampedArray;
  stats: PipelineStats;
}

export interface DetailPreset {
  id: string;
  name: string;
  desc: string;
  patch: Partial<Settings>;
}

export const DETAIL_PRESETS: DetailPreset[] = [
  {
    id: 'silhouette',
    name: 'Silhouette',
    desc: 'Eine Schablone, harter Kontrast. Plakativer Street-Art-Look.',
    patch: {
      levels: 1,
      mode: 'mono',
      paperAsLightest: true,
      smoothing: 55,
      contrast: 68,
      detail: 46,
      outline: false,
      spreadMm: 0,
      bridgeMm: 2.5,
    },
  },
  {
    id: 'plakat',
    name: 'Plakat (2)',
    desc: 'Zwei Ebenen: Schatten + Schwarz. Schnell gesprüht.',
    patch: {
      levels: 2,
      mode: 'mono',
      paperAsLightest: true,
      smoothing: 50,
      contrast: 62,
      detail: 60,
      outline: false,
      bridgeMm: 2,
    },
  },
  {
    id: 'banksy',
    name: 'Banksy (3)',
    desc: 'Der Klassiker: drei Tonstufen, kräftige Stege, weiche Kanten.',
    patch: {
      levels: 3,
      mode: 'mono',
      paperAsLightest: true,
      smoothing: 58,
      contrast: 58,
      detail: 76,
      outline: false,
      bridgeMm: 1.6,
    },
  },
  {
    id: 'fein',
    name: 'Fein (4)',
    desc: 'Vier Ebenen für Porträts mit Mittelton-Zeichnung.',
    patch: {
      levels: 4,
      mode: 'mono',
      paperAsLightest: true,
      smoothing: 52,
      contrast: 52,
      detail: 86,
      outline: false,
      bridgeMm: 1.2,
    },
  },
  {
    id: 'maximum',
    name: 'Maximum (6)',
    desc: 'Sechs Ebenen, viel Handarbeit. Fast fotografisch.',
    patch: {
      levels: 6,
      mode: 'mono',
      paperAsLightest: true,
      smoothing: 45,
      contrast: 50,
      detail: 94,
      outline: false,
      bridgeMm: 1,
    },
  },
  {
    id: 'kontur',
    name: 'Kontur + Ton',
    desc: 'Drei Tonstufen plus Konturen-Ebene – hält Details im Gesicht.',
    patch: {
      levels: 3,
      mode: 'mono',
      paperAsLightest: true,
      smoothing: 50,
      contrast: 55,
      detail: 91,
      outline: true,
      outlineMm: 0.7,
      outlineStrength: 55,
      bridgeMm: 1.2,
    },
  },
  {
    id: 'farbe',
    name: 'Farbe (4)',
    desc: 'Vier Farbcluster (Lab) – Plakat in Bunt, z. B. mit Rot-Akzent.',
    patch: {
      levels: 4,
      mode: 'color',
      paperAsLightest: true,
      smoothing: 62,
      contrast: 50,
      detail: 60,
      outline: false,
      bridgeMm: 1.6,
      palette: 'auto',
    },
  },
];

export const DEFAULT_SETTINGS: Settings = {
  removeBackground: false,
  bgTolerance: 24,
  invert: false,
  brightness: 0,
  contrast: 50,
  quality: 'standard',

  levels: 3,
  mode: 'mono',
  paperAsLightest: true,
  smoothing: 58,
  detail: 76,

  model: 'separate',
  bridges: true,
  bridgeMm: 1.6,
  minFeatureMm: 2,
  minHoleMm: 1.4,
  minStripMm: 1,
  sheetBorderMm: 4,
  spreadMm: 0.4,
  smoothEdges: true,
  outline: false,
  outlineMm: 0.7,
  outlineStrength: 55,

  widthMm: 210,
  paper: 'a4',
  orientation: 'portrait',
  dpi: 300,
  marginMm: 8,
  tileOverlapMm: 10,
  registration: true,
  layerColors: [],
  paperColor: '#f4f1ea',
  palette: 'banksy',
};

/**
 * Feinheit (0..100) -> Mindestgrößen in mm.
 * Grob = große Flächen, schnell zu schneiden; fein = kleine Details,
 * braucht Geduld und eine ruhige Hand.
 */
export function deriveFromDetail(detail: number): { minFeatureMm: number; minHoleMm: number; minStripMm: number } {
  const d = Math.max(0, Math.min(100, detail)) / 100;
  const r = (v: number) => Math.round(v * 20) / 20;
  return {
    minFeatureMm: r(6.5 - 5.9 * d),
    minHoleMm: r(4.5 - 4.0 * d),
    minStripMm: r(2.4 - 1.4 * d),
  };
}

/** Arbeitsauflösung (längere Bildkante in Pixeln) je Qualitätsstufe. */
export const QUALITY_PX: Record<Quality, number> = {
  schnell: 800,
  standard: 1200,
  hoch: 1800,
};

/** Farbpaletten für die Sprühebenen (Index 0 = hellste Ebene). */
export const PALETTES: Record<string, { name: string; colors: string[] }> = {
  auto: { name: 'Farben aus dem Bild', colors: [] },
  banksy: { name: 'Banksy (Schwarz)', colors: ['#8a8a8a', '#4a4a4a', '#1b1b1b', '#000000', '#000000', '#000000'] },
  akzent: { name: 'Rot-Akzent', colors: ['#9aa0a6', '#5b6166', '#1b1b1b', '#c1121f', '#000000', '#000000'] },
  blau: { name: 'Stahlblau', colors: ['#a9bfd1', '#6b8fae', '#2f4858', '#101418', '#000000', '#000000'] },
  sepia: { name: 'Sepia', colors: ['#c9b291', '#9c7f56', '#5c4630', '#241a12', '#000000', '#000000'] },
  neon: { name: 'Neon', colors: ['#b9fbc0', '#48cae4', '#f72585', '#10002b', '#000000', '#000000'] },
  einklang: { name: 'Einfarbig (1 Farbe)', colors: ['#000000', '#000000', '#000000', '#000000', '#000000', '#000000'] },
};
