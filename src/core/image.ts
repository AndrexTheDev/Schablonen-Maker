/** Bild-Ein-/Ausgabe auf dem Hauptthread (Canvas, ImageBitmap, Dateien). */

export interface WorkImage {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function loadImageFromFile(file: File | Blob): Promise<ImageBitmap> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* Fallback unten */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      img.src = url;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Skaliert auf die Arbeitsauflösung (längere Kante = targetLongEdge). */
export function bitmapToWorkRGBA(bitmap: ImageBitmap, targetLongEdge: number): WorkImage {
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, targetLongEdge / longEdge);
  const w = Math.max(8, Math.round(bitmap.width * scale));
  const h = Math.max(8, Math.round(bitmap.height * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { rgba: data.data, width: w, height: h };
}

/** Zuschneiden (Pixelkoordinaten im Original). */
export async function cropBitmap(
  bitmap: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<ImageBitmap> {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  return createImageBitmap(canvas);
}

export async function rotateBitmap(bitmap: ImageBitmap, deg: 90 | 180 | 270): Promise<ImageBitmap> {
  const swap = deg === 90 || deg === 270;
  const canvas = makeCanvas(swap ? bitmap.height : bitmap.width, swap ? bitmap.width : bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return createImageBitmap(canvas);
}

export function rgbaToCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const img = new ImageData(new Uint8ClampedArray(rgba), w, h);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas-Export fehlgeschlagen'))), type, quality);
  });
}

/** Vorschau-Bild (data URL) für kleine Thumbnails. */
export function bitmapToDataUrl(bitmap: ImageBitmap, maxPx = 320): string {
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const canvas = makeCanvas(bitmap.width * scale, bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
