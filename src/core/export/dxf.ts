/**
 * DXF-Export (LWPOLYLINE, mm, Y nach oben) – für Laser/CNC
 * (LightBurn, RDWorks, LaserGRBL, CNC-Fräsen).
 */

import type { Layer } from '../types';

export function layerToDxf(layer: Layer, mmPerPx: number, artHmm: number, marginMm = 0): string {
  const out: string[] = [];
  const push = (...vals: (string | number)[]) => out.push(...vals.map(String));
  push(0, 'SECTION', 2, 'HEADER');
  push(9, '$INSUNITS', 70, 4); // 4 = Millimeter
  push(0, 'ENDSEC');
  push(0, 'SECTION', 2, 'ENTITIES');
  for (const c of layer.contours) {
    const pts = c.pts;
    if (pts.length < 6) continue;
    const n = pts.length / 2;
    push(0, 'LWPOLYLINE', 8, 'SCHABLONE', 62, 7, 90, n, 70, 1);
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2] * mmPerPx + marginMm;
      const y = artHmm - pts[i * 2 + 1] * mmPerPx + marginMm;
      push(10, round(x), 20, round(y));
    }
  }
  push(0, 'ENDSEC', 0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

const round = (v: number) => Math.round(v * 1000) / 1000;
