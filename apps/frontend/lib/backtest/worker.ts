/**
 * Web Worker entry point for backtest computation
 * Thin wrapper around backtest-engine
 */

import type { WorkerRequest, WorkerResponse } from './types';
import { runBacktest } from './engine/backtest-engine';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { type, config, prices } = event.data;

  if (type !== 'start') return;

  try {
    const result = runBacktest(config, prices, (progress) => {
      const msg: WorkerResponse = { type: 'progress', progress };
      self.postMessage(msg);
    });

    const msg: WorkerResponse = { type: 'result', result };
    self.postMessage(msg);
  } catch (error) {
    const msg: WorkerResponse = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(msg);
  }
};
