import React, { useEffect, useRef } from 'react';
import type { Layer, PipelineResult } from '../core/types';
import { hexToRgb } from '../core/color';

/**
 * Schnelle Canvas-Darstellungen. Die Masken liegen in Arbeitsauflösung vor;
 * das Canvas wird auf die Zielgröße skaliert (CSS).
 */

export function MaskCanvas({
  mask,
  w,
  h,
  fg = [0, 0, 0],
  bg = [255, 255, 255],
  alphaBg = false,
  overlay,
  style,
}: {
  mask: Uint8Array | null | undefined;
  w: number;
  h: number;
  fg?: [number, number, number];
  bg?: [number, number, number];
  alphaBg?: boolean;
  overlay?: { mask?: Uint8Array; color: [number, number, number] }[];
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !mask) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < mask.length; i++) {
      const on = mask[i];
      d[i * 4] = on ? fg[0] : bg[0];
      d[i * 4 + 1] = on ? fg[1] : bg[1];
      d[i * 4 + 2] = on ? fg[2] : bg[2];
      d[i * 4 + 3] = alphaBg && !on ? 0 : 255;
    }
    ctx.putImageData(img, 0, 0);
    if (overlay) {
      for (const o of overlay) {
        if (!o.mask || o.mask.length !== mask.length) continue;
        const ov = ctx.createImageData(w, h);
        const od = ov.data;
        for (let i = 0; i < o.mask.length; i++) {
          if (o.mask[i]) {
            od[i * 4] = o.color[0];
            od[i * 4 + 1] = o.color[1];
            od[i * 4 + 2] = o.color[2];
            od[i * 4 + 3] = 235;
          }
        }
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        tmp.getContext('2d')!.putImageData(ov, 0, 0);
        ctx.drawImage(tmp, 0, 0);
      }
    }
  }, [mask, w, h, fg, bg, alphaBg, overlay]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', ...style }} />;
}

export function RgbaCanvas({
  rgba,
  w,
  h,
  style,
}: {
  rgba: Uint8ClampedArray | null | undefined;
  w: number;
  h: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !rgba) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  }, [rgba, w, h]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', ...style }} />;
}

/** Material einer Ebene (schwarz auf weiß) mit optionalen Markierungen. */
export function LayerView({
  layer,
  result,
  showIslands,
  showBridges,
  colored,
}: {
  layer: Layer;
  result: PipelineResult;
  showIslands?: boolean;
  showBridges?: boolean;
  colored?: boolean;
}) {
  const material = React.useMemo(() => {
    const m = new Uint8Array(layer.holes.length);
    for (let i = 0; i < m.length; i++) m[i] = layer.holes[i] ? 0 : 1;
    return m;
  }, [layer]);
  const fg = colored ? hexToRgb(layer.color) : ([0, 0, 0] as [number, number, number]);
  const overlay = [];
  if (showIslands && layer.islands?.length) overlay.push({ mask: layer.islands, color: [220, 40, 40] as [number, number, number] });
  if (showBridges && layer.bridges?.length) overlay.push({ mask: layer.bridges, color: [30, 130, 255] as [number, number, number] });
  return <MaskCanvas mask={material} w={result.width} h={result.height} fg={fg} bg={[255, 255, 255]} overlay={overlay} />;
}

/** Kleine Vorschau einer Ebene für Karten/Thumbnails. */
export function LayerThumb({ layer, result }: { layer: Layer; result: PipelineResult }) {
  const material = React.useMemo(() => {
    const m = new Uint8Array(layer.holes.length);
    for (let i = 0; i < m.length; i++) m[i] = layer.holes[i] ? 0 : 1;
    return m;
  }, [layer]);
  return (
    <div className="layer-thumb">
      <MaskCanvas mask={material} w={result.width} h={result.height} />
    </div>
  );
}
