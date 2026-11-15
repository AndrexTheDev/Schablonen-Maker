import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ZoomPaneProps {
  children: React.ReactNode;
  /** Größe des Inhalts in Pixeln (Bildkoordinaten) */
  imageW: number;
  imageH: number;
  cropMode?: boolean;
  cropRect?: Rect | null;
  onCropChange?: (r: Rect | null) => void;
  hint?: string;
  background?: string;
}

/**
 * Zoom-/Pan-Fläche mit optionaler Zuschneide-Auswahl.
 * Mausrad = zoomen, Ziehen = verschieben, Doppelklick = zurücksetzen.
 */
export function ZoomPane({
  children,
  imageW,
  imageH,
  cropMode = false,
  cropRect,
  onCropChange,
  hint,
  background,
}: ZoomPaneProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ mode: 'pan' | 'crop'; sx: number; sy: number; px: number; py: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitScale = box.w > 0 && box.h > 0 ? Math.min(box.w / imageW, box.h / imageH) * 0.94 : 0;
  const scale = fitScale * zoom;
  const dispW = imageW * scale;
  const dispH = imageH * scale;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0016);
      setZoom((z) => Math.min(12, Math.max(0.35, z * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toImage = useCallback(
    (clientX: number, clientY: number) => {
      const rect = innerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: Math.max(0, Math.min(imageW, ((clientX - rect.left) / rect.width) * imageW)),
        y: Math.max(0, Math.min(imageH, ((clientY - rect.top) / rect.height) * imageH)),
      };
    },
    [imageW, imageH]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (cropMode) {
      const p = toImage(e.clientX, e.clientY);
      dragRef.current = { mode: 'crop', sx: p.x, sy: p.y, px: 0, py: 0 };
      onCropChange?.({ x: p.x, y: p.y, w: 0, h: 0 });
    } else {
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    }
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'crop') {
      const p = toImage(e.clientX, e.clientY);
      const x = Math.min(d.sx, p.x);
      const y = Math.min(d.sy, p.y);
      const w = Math.abs(p.x - d.sx);
      const h = Math.abs(p.y - d.sy);
      onCropChange?.({ x, y, w, h });
    } else {
      setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const cropStyle =
    cropRect && cropRect.w > 1 && cropRect.h > 1
      ? {
          left: (cropRect.x / imageW) * dispW,
          top: (cropRect.y / imageH) * dispH,
          width: (cropRect.w / imageW) * dispW,
          height: (cropRect.h / imageH) * dispH,
        }
      : null;

  return (
    <div
      ref={wrapRef}
      className={`zoom-pane ${dragging ? 'grabbing' : ''}`}
      style={background ? { background } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={reset}
    >
      <div
        ref={innerRef}
        className="zoom-inner"
        style={{ width: dispW || undefined, height: dispH || undefined, transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        {children}
        {cropStyle && <div className="crop-rect" style={cropStyle} />}
      </div>
      <div className="zoom-hint">
        {hint ?? (cropMode ? 'Ziehen: Ausschnitt wählen' : `Mausrad: zoomen · Ziehen: verschieben · Doppelklick: zurücksetzen · ${Math.round(zoom * 100)} %`)}
      </div>
    </div>
  );
}
