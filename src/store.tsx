import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  bitmapToDataUrl,
  bitmapToWorkRGBA,
  cropBitmap,
  loadImageFromFile,
  rotateBitmap,
  type WorkImage,
} from './core/image';
import { computePipeline } from './worker/client';
import {
  DEFAULT_SETTINGS,
  QUALITY_PX,
  deriveFromDetail,
  type DetailPreset,
  type PipelineResult,
  type Settings,
} from './core/types';
import { buildExportZip, DEFAULT_FORMATS, exportSingle, type ExportFormats } from './export';
import { isDesktop, pickImageFile, pickProjectFile, saveFile } from './platform';

export interface Source {
  name: string;
  bitmap: ImageBitmap;
  original: ImageBitmap;
  dataUrl: string;
  width: number;
  height: number;
}

type ToastKind = 'ok' | 'err' | 'info';
interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
}

interface StudioValue {
  source: Source | null;
  work: WorkImage | null;
  settings: Settings;
  result: PipelineResult | null;
  busy: boolean;
  error: string | null;
  step: number;
  progress: { msg: string; pct: number } | null;
  formats: ExportFormats;
  desktop: boolean;
  toasts: Toast[];
  setStep: (n: number) => void;
  setSettings: (patch: Partial<Settings>) => void;
  applyPreset: (p: DetailPreset) => void;
  resetSettings: () => void;
  setFormats: (patch: Partial<ExportFormats>) => void;
  notify: (msg: string, kind?: ToastKind) => void;
  loadBlob: (blob: Blob, name: string) => Promise<void>;
  loadDataUrl: (url: string, name: string) => Promise<void>;
  loadFromDesktop: () => Promise<void>;
  pickFile: () => Promise<void>;
  resetImage: () => Promise<void>;
  rotate: () => Promise<void>;
  crop: (x: number, y: number, w: number, h: number) => Promise<void>;
  saveProject: () => Promise<void>;
  openProject: () => Promise<void>;
  exportZip: () => Promise<void>;
  exportPdf: (print?: boolean) => Promise<void>;
  exportSvg: () => Promise<void>;
  exportPng: (layerIndex: number) => Promise<void>;
  cameraOpen: boolean;
  setCameraOpen: (v: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
}

const StudioContext = createContext<StudioValue | null>(null);

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio outside provider');
  return ctx;
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [source, setSource] = useState<Source | null>(null);
  const [work, setWork] = useState<WorkImage | null>(null);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [progress, setProgress] = useState<{ msg: string; pct: number } | null>(null);
  const [formats, setFormatsState] = useState<ExportFormats>(DEFAULT_FORMATS);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const toastId = useRef(1);
  const pipelineId = useRef(0);

  const notify = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const setFormats = useCallback((patch: Partial<ExportFormats>) => {
    setFormatsState((f) => ({ ...f, ...patch }));
  }, []);

  const applyPreset = useCallback(
    (p: DetailPreset) => {
      setSettingsState((s) => {
        const detail = p.patch.detail ?? s.detail;
        return { ...s, ...p.patch, ...deriveFromDetail(detail), layerColors: [] };
      });
      notify(`${p.name} gewählt`, 'ok');
    },
    [notify]
  );

  const resetSettings = useCallback(() => {
    setSettingsState({ ...DEFAULT_SETTINGS, widthMm: settings.widthMm });
    notify('Einstellungen zurückgesetzt');
  }, [notify, settings.widthMm]);

  /* ---------------- Bild laden ---------------- */

  const loadBlob = useCallback(
    async (blob: Blob, name: string) => {
      try {
        const bitmap = await loadImageFromFile(blob);
        const dataUrl = bitmapToDataUrl(bitmap, 1400);
        setSource({
          name,
          bitmap,
          original: bitmap,
          dataUrl,
          width: bitmap.width,
          height: bitmap.height,
        });
        setStep(1);
        notify(`${name} geladen (${bitmap.width} × ${bitmap.height} px)`, 'ok');
      } catch (e) {
        notify('Bild konnte nicht geladen werden', 'err');
      }
    },
    [notify]
  );

  const loadDataUrl = useCallback(
    async (url: string, name: string) => {
      const res = await fetch(url);
      const blob = await res.blob();
      await loadBlob(blob, name);
    },
    [loadBlob]
  );

  const loadFromDesktop = useCallback(async () => {
    if (window.schablone) {
      const res = await window.schablone.openImage();
      if (res) {
        const blob = new Blob([res.data as unknown as BlobPart]);
        await loadBlob(blob, res.name);
      }
      return;
    }
    const file = await pickImageFile();
    if (file) await loadBlob(file, file.name);
  }, [loadBlob]);

  const pickFile = loadFromDesktop;

  const resetImage = useCallback(async () => {
    if (!source) return;
    const bitmap = source.original;
    setSource({ ...source, bitmap, width: bitmap.width, height: bitmap.height });
  }, [source]);

  const rotate = useCallback(async () => {
    if (!source) return;
    const bitmap = await rotateBitmap(source.bitmap, 90);
    setSource({ ...source, bitmap, width: bitmap.width, height: bitmap.height });
  }, [source]);

  const crop = useCallback(
    async (x: number, y: number, w: number, h: number) => {
      if (!source) return;
      const bitmap = await cropBitmap(source.bitmap, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      setSource({ ...source, bitmap, width: bitmap.width, height: bitmap.height });
      notify('Zugeschnitten', 'ok');
    },
    [source, notify]
  );

  /* ---------------- Arbeitsbild ---------------- */

  useEffect(() => {
    if (!source) {
      setWork(null);
      return;
    }
    let alive = true;
    const target = QUALITY_PX[settings.quality] ?? QUALITY_PX.standard;
    const id = setTimeout(() => {
      const w = bitmapToWorkRGBA(source.bitmap, target);
      if (alive) setWork(w);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [source, settings.quality]);

  /* ---------------- Pipeline (entprellt) ---------------- */

  useEffect(() => {
    if (!work) {
      setResult(null);
      return;
    }
    const myId = ++pipelineId.current;
    setBusy(true);
    const handle = setTimeout(() => {
      computePipeline(work.rgba, work.width, work.height, settings)
        .then((res) => {
          if (pipelineId.current !== myId) return;
          setResult(res);
          setError(null);
        })
        .catch((e: Error) => {
          if (pipelineId.current !== myId) return;
          setError(e.message || 'Berechnung fehlgeschlagen');
        })
        .finally(() => {
          if (pipelineId.current === myId) setBusy(false);
        });
    }, 170);
    return () => clearTimeout(handle);
  }, [work, settings]);

  /* ---------------- Projekt ---------------- */

  const projectJson = useCallback(() => {
    if (!source) return null;
    return JSON.stringify(
      {
        format: 'schablonen-maker',
        version: 1,
        created: new Date().toISOString(),
        sourceName: source.name,
        settings,
        image: source.dataUrl,
      },
      null,
      1
    );
  }, [source, settings]);

  const saveProject = useCallback(async () => {
    const json = projectJson();
    if (!json) return notify('Kein Bild geladen', 'err');
    const name = `schablone-${new Date().toISOString().slice(0, 10)}.schablone`;
    if (window.schablone) {
      const res = await window.schablone.saveProject(name, json);
      notify(res.ok ? 'Projekt gespeichert' : 'Speichern abgebrochen', res.ok ? 'ok' : 'info');
    } else {
      await saveFile(name, json, 'application/json');
      notify('Projekt heruntergeladen', 'ok');
    }
  }, [projectJson, notify]);

  const openProject = useCallback(async () => {
    let json: string | null = null;
    if (window.schablone) {
      const res = await window.schablone.openProject();
      if (res) json = res.json;
    } else {
      const file = await pickProjectFile();
      if (file) json = await file.text();
    }
    if (!json) return;
    try {
      const data = JSON.parse(json);
      if (data.format !== 'schablonen-maker') throw new Error('unbekanntes Format');
      setSettingsState({ ...DEFAULT_SETTINGS, ...data.settings });
      if (data.image) await loadDataUrl(data.image, data.sourceName ?? 'Projekt');
      notify('Projekt geladen', 'ok');
    } catch (e) {
      notify('Projektdatei konnte nicht gelesen werden', 'err');
    }
  }, [loadDataUrl, notify]);

  /* ---------------- Export ---------------- */

  const exportZip = useCallback(async () => {
    if (!result || !source) return notify('Noch keine Schablone berechnet', 'err');
    setProgress({ msg: 'Paket wird gebaut…', pct: 0 });
    try {
      const blob = await buildExportZip({
        result,
        settings,
        formats,
        sourceDataUrl: source.dataUrl,
        sourceName: source.name,
        onProgress: (msg, pct) => setProgress({ msg, pct }),
      });
      const name = `Schablonen-${new Date().toISOString().slice(0, 10)}.zip`;
      const res = await saveFile(name, blob, 'application/zip');
      notify(
        res === 'saved' ? `Gespeichert: ${name}` : res === 'downloaded' ? `Download: ${name}` : 'Export abgebrochen',
        res === 'error' ? 'err' : 'ok'
      );
    } catch (e) {
      notify(`Export fehlgeschlagen: ${(e as Error).message}`, 'err');
    } finally {
      setProgress(null);
    }
  }, [result, settings, formats, source, notify]);

  const exportPdf = useCallback(
    async (print = false) => {
      if (!result) return notify('Noch keine Schablone berechnet', 'err');
      setProgress({ msg: 'PDF wird gebaut…', pct: 5 });
      try {
        const { name, blob } = await exportSingle(result, settings, 'pdf');
        if (print && window.schablone) {
          await saveFile(name, blob, 'application/pdf');
          window.schablone.print();
        } else {
          await saveFile(name, blob, 'application/pdf');
        }
        notify('Druck-PDF erstellt', 'ok');
      } catch (e) {
        notify(`PDF fehlgeschlagen: ${(e as Error).message}`, 'err');
      } finally {
        setProgress(null);
      }
    },
    [result, settings, notify]
  );

  const exportSvg = useCallback(async () => {
    if (!result) return notify('Noch keine Schablone berechnet', 'err');
    setProgress({ msg: 'SVG wird gebaut…', pct: 10 });
    try {
      for (let i = 0; i < result.layers.length; i++) {
        const { name, blob } = await exportSingle(result, settings, 'svg', i);
        await saveFile(name, blob, 'image/svg+xml');
      }
      notify(`${result.layers.length} SVG-Dateien exportiert`, 'ok');
    } catch (e) {
      notify(`SVG-Export fehlgeschlagen: ${(e as Error).message}`, 'err');
    } finally {
      setProgress(null);
    }
  }, [result, settings, notify]);

  const exportPng = useCallback(
    async (layerIndex: number) => {
      if (!result) return;
      setProgress({ msg: 'PNG wird gerendert…', pct: 15 });
      try {
        const { name, blob } = await exportSingle(result, settings, 'png', layerIndex);
        await saveFile(name, blob, 'image/png');
        notify('PNG exportiert', 'ok');
      } catch (e) {
        notify(`PNG-Export fehlgeschlagen: ${(e as Error).message}`, 'err');
      } finally {
        setProgress(null);
      }
    },
    [result, settings, notify]
  );

  /* ---------------- Tastatur/Einfügen ---------------- */

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (blob) await loadBlob(blob, 'Zwischenablage');
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadBlob]);

  useEffect(() => {
    if (!window.schablone?.onMenu) return;
    const offs = [
      window.schablone.onMenu('menu:open-image', () => void loadFromDesktop()),
      window.schablone.onMenu('menu:open-project', () => void openProject()),
      window.schablone.onMenu('menu:save-project', () => void saveProject()),
      window.schablone.onMenu('menu:export-zip', () => void exportZip()),
      window.schablone.onMenu('menu:export-pdf', () => void exportPdf()),
      window.schablone.onMenu('menu:shortcuts', () => setHelpOpen(true)),
    ];
    return () => offs.forEach((off) => off && off());
  }, [loadFromDesktop, openProject, saveProject, exportZip, exportPdf]);

  const value = useMemo<StudioValue>(
    () => ({
      source,
      work,
      settings,
      result,
      busy,
      error,
      step,
      progress,
      formats,
      desktop: isDesktop(),
      toasts,
      setStep,
      setSettings,
      applyPreset,
      resetSettings,
      setFormats,
      notify,
      loadBlob,
      loadDataUrl,
      loadFromDesktop,
      pickFile,
      resetImage,
      rotate,
      crop,
      saveProject,
      openProject,
      exportZip,
      exportPdf,
      exportSvg,
      exportPng,
      cameraOpen,
      setCameraOpen,
      helpOpen,
      setHelpOpen,
    }),
    [
      source,
      work,
      settings,
      result,
      busy,
      error,
      step,
      progress,
      formats,
      toasts,
      setSettings,
      applyPreset,
      resetSettings,
      setFormats,
      notify,
      loadBlob,
      loadDataUrl,
      loadFromDesktop,
      pickFile,
      resetImage,
      rotate,
      crop,
      saveProject,
      openProject,
      exportZip,
      exportPdf,
      exportSvg,
      exportPng,
      cameraOpen,
      helpOpen,
    ]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
