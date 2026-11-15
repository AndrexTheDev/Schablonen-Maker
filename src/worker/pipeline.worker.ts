/// <reference lib="webworker" />
/**
 * Web Worker: führt die komplette Pipeline aus, damit die Oberfläche
 * auch bei 2500 px Arbeitsbreite flüssig bleibt.
 */

import { runPipeline } from '../core/pipeline';
import type { PipelineResult, Settings } from '../core/types';

export interface WorkerRequest {
  id: number;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  settings: Settings;
}

export interface WorkerResponse {
  id: number;
  result?: PipelineResult;
  error?: string;
  ms?: number;
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, rgba, width, height, settings } = ev.data;
  try {
    const result = runPipeline({ rgba, width, height, settings });
    const transfer: ArrayBuffer[] = [];
    const push = (a?: ArrayBufferView) => {
      if (a && a.buffer instanceof ArrayBuffer) transfer.push(a.buffer);
    };
    push(result.composite);
    push(result.original);
    push(result.toneMap);
    for (const l of result.layers) {
      push(l.holes);
      push(l.islands);
      push(l.bridges);
    }
    (self as unknown as Worker).postMessage({ id, result } as WorkerResponse, transfer);
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    (self as unknown as Worker).postMessage({ id, error: message } as WorkerResponse);
  }
};
