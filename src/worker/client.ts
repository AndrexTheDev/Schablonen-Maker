/**
 * Client für den Pipeline-Worker mit synchronem Fallback
 * (falls der Worker z. B. unter file:// nicht startet).
 */

import { runPipeline } from '../core/pipeline';
import type { PipelineResult, Settings } from '../core/types';
import type { WorkerRequest, WorkerResponse } from './pipeline.worker';

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (r: PipelineResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error));
      else entry.resolve(msg.result!);
    };
    worker.onerror = (ev) => {
      console.warn('Pipeline-Worker fehlgeschlagen, rechne im Hauptthread:', ev.message);
      workerBroken = true;
      for (const [, p] of pending) p.reject(new Error('worker-failed'));
      pending.clear();
      worker = null;
    };
    return worker;
  } catch (err) {
    workerBroken = true;
    return null;
  }
}

export async function computePipeline(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  settings: Settings
): Promise<PipelineResult> {
  const wk = getWorker();
  if (wk) {
    const id = nextId++;
    return new Promise<PipelineResult>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const copy = new Uint8ClampedArray(rgba);
      wk.postMessage({ id, rgba: copy, width, height, settings } as WorkerRequest, [copy.buffer]);
    }).catch(async (err: Error) => {
      if (err.message === 'worker-failed') {
        return runPipeline({ rgba, width, height, settings });
      }
      throw err;
    });
  }
  // Synchroner Fallback (blockiert kurz, funktioniert aber immer)
  await new Promise((r) => setTimeout(r, 10));
  return runPipeline({ rgba, width, height, settings });
}

export function disposeWorker() {
  worker?.terminate();
  worker = null;
}
