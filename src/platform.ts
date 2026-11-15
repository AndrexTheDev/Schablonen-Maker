/**
 * Plattform-Brücke: in der Windows-App (Electron) sprechen wir über IPC mit
 * dem Hauptprozess (echte Dateidialoge), im Browser gibt es den Download.
 */

export interface DesktopBridge {
  isElectron: true;
  version: string;
  saveFile: (name: string, data: Uint8Array, filters?: string) => Promise<{ ok: boolean; path?: string; canceled?: boolean }>;
  openImage: () => Promise<{ name: string; data: Uint8Array } | null>;
  saveProject: (name: string, json: string) => Promise<{ ok: boolean; path?: string; canceled?: boolean }>;
  openProject: () => Promise<{ name: string; json: string } | null>;
  print: () => void;
  onMenu: (channel: string, handler: () => void) => (() => void) | undefined;
}

declare global {
  interface Window {
    schablone?: DesktopBridge;
  }
}

export const isDesktop = () => typeof window !== 'undefined' && !!window.schablone;

export type SaveResult = 'saved' | 'canceled' | 'downloaded' | 'error';

export async function saveFile(name: string, data: Uint8Array | string | Blob, mime = 'application/octet-stream'): Promise<SaveResult> {
  let bytes: Uint8Array;
  let blob: Blob;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
    blob = new Blob([bytes], { type: mime || 'text/plain;charset=utf-8' });
  } else if (data instanceof Blob) {
    bytes = new Uint8Array(await data.arrayBuffer());
    blob = data;
  } else {
    bytes = data;
    blob = new Blob([bytes], { type: mime });
  }
  if (window.schablone) {
    try {
      const res = await window.schablone.saveFile(name, bytes);
      return res.canceled ? 'canceled' : res.ok ? 'saved' : 'error';
    } catch {
      return 'error';
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  } catch {
    return 'error';
  }
}

/** Datei-Auswahl (Browser-Fallback). */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function pickProjectFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.schablone,.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
