import type { RunRow } from '../ports.js';
import { POLL_FAST_COUNT, POLL_FAST_MS, POLL_SLOW_MS } from '../constants.js';

export interface WaitProgress {
  elapsedMs: number;
  totalMs: number;
  message: string;
}

export interface WaitForRunParams {
  pollRuns: () => Promise<RunRow[]>;
  runId: string;
  budgetMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  onProgress?: (progress: WaitProgress) => void;
  signal?: AbortSignal;
}

export type WaitResult =
  | { kind: 'done'; run: RunRow }
  | { kind: 'failed'; run: RunRow }
  | { kind: 'budget_exceeded'; elapsedMs: number }
  | { kind: 'cancelled'; elapsedMs: number };

export async function waitForRun(params: WaitForRunParams): Promise<WaitResult> {
  const { pollRuns, runId, budgetMs, now, sleep, onProgress, signal } = params;
  const startedAt = now();
  let pollCount = 0;

  while (true) {
    if (signal?.aborted) {
      return { kind: 'cancelled', elapsedMs: now() - startedAt };
    }

    const runs = await pollRuns();
    pollCount += 1;
    const run = runs.find((candidate) => candidate.run_id === runId);
    const elapsedMs = now() - startedAt;

    onProgress?.({
      elapsedMs,
      totalMs: budgetMs,
      message: `review running (${Math.floor(elapsedMs / 1000)}s)`,
    });

    if (run?.status === 'done') {
      return { kind: 'done', run };
    }
    if (run?.status === 'failed' || run?.status === 'cancelled') {
      return { kind: 'failed', run };
    }

    if (elapsedMs >= budgetMs) {
      return { kind: 'budget_exceeded', elapsedMs };
    }

    const intervalMs = pollCount <= POLL_FAST_COUNT ? POLL_FAST_MS : POLL_SLOW_MS;
    await sleep(intervalMs);
  }
}
