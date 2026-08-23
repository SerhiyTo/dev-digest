import { describe, expect, it, vi } from 'vitest';
import type { RunRow } from '../src/ports.js';
import { waitForRun } from '../src/review/wait.js';
import { POLL_FAST_COUNT, POLL_FAST_MS, POLL_SLOW_MS } from '../src/constants.js';

function makeRun(overrides: Partial<RunRow> = {}): RunRow {
  return {
    run_id: 'r1',
    agent_id: 'a1',
    agent_name: 'Security',
    status: 'running',
    ran_at: null,
    error: null,
    score: null,
    findings_count: null,
    ...overrides,
  };
}

function fakeClock() {
  let time = 0;
  const now = () => time;
  const sleep = async (ms: number) => {
    time += ms;
  };
  return { now, sleep };
}

describe('waitForRun', () => {
  it('terminates on the first done', async () => {
    const { now, sleep } = fakeClock();
    const pollRuns = vi.fn(async () => [makeRun({ status: 'done' })]);

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs: 180_000,
      now,
      sleep,
    });

    expect(result.kind).toBe('done');
    expect(pollRuns).toHaveBeenCalledTimes(1);
  });

  it('terminates on failed, carrying RunRow.error', async () => {
    const { now, sleep } = fakeClock();
    const pollRuns = vi.fn(async () => [
      makeRun({ status: 'failed', error: 'openrouter 401' }),
    ]);

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs: 180_000,
      now,
      sleep,
    });

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.run.error).toBe('openrouter 401');
    }
  });

  it('terminates on cancelled from the API, mapped to kind: failed', async () => {
    const { now, sleep } = fakeClock();
    const pollRuns = vi.fn(async () => [makeRun({ status: 'cancelled' })]);

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs: 180_000,
      now,
      sleep,
    });

    expect(result.kind).toBe('failed');
  });

  it('returns budget_exceeded at the budget without overshooting it', async () => {
    const { now, sleep } = fakeClock();
    const pollRuns = vi.fn(async () => [makeRun({ status: 'running' })]);
    const budgetMs = POLL_FAST_MS * 3;

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs,
      now,
      sleep,
    });

    expect(result.kind).toBe('budget_exceeded');
    if (result.kind === 'budget_exceeded') {
      expect(result.elapsedMs).toBe(budgetMs);
    }
    expect(pollRuns).toHaveBeenCalledTimes(4);
  });

  it('signal.abort() stops it within one poll and returns cancelled', async () => {
    const { now, sleep: rawSleep } = fakeClock();
    const controller = new AbortController();
    const pollRuns = vi.fn(async () => [makeRun({ status: 'running' })]);
    const sleep = async (ms: number) => {
      await rawSleep(ms);
      if (pollRuns.mock.calls.length === 1) {
        controller.abort();
      }
    };

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs: 180_000,
      now,
      sleep,
      signal: controller.signal,
    });

    expect(result.kind).toBe('cancelled');
    expect(pollRuns).toHaveBeenCalledTimes(1);
  });

  it('an already-aborted signal returns before any poll happens', async () => {
    const { now, sleep } = fakeClock();
    const controller = new AbortController();
    controller.abort();
    const pollRuns = vi.fn(async () => [makeRun({ status: 'running' })]);

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs: 180_000,
      now,
      sleep,
      signal: controller.signal,
    });

    expect(result.kind).toBe('cancelled');
    expect(pollRuns).toHaveBeenCalledTimes(0);
  });

  it('fires progress once per poll, and not at all when onProgress is undefined', async () => {
    const { now, sleep } = fakeClock();
    let callCount = 0;
    const pollRuns = vi.fn(async () => {
      callCount += 1;
      return [makeRun({ status: callCount >= 3 ? 'done' : 'running' })];
    });
    const onProgress = vi.fn();

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs: 180_000,
      now,
      sleep,
      onProgress,
    });

    expect(result.kind).toBe('done');
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0]?.[0]).toMatchObject({
      elapsedMs: 0,
      totalMs: 180_000,
    });

    callCount = 0;
    await expect(
      waitForRun({
        pollRuns,
        runId: 'r1',
        budgetMs: 180_000,
        now,
        sleep,
      }),
    ).resolves.toMatchObject({ kind: 'done' });
  });

  it('switches interval from POLL_FAST_MS to POLL_SLOW_MS after POLL_FAST_COUNT polls', async () => {
    const { now, sleep: rawSleep } = fakeClock();
    const recordedDurations: number[] = [];
    const sleep = async (ms: number) => {
      recordedDurations.push(ms);
      await rawSleep(ms);
    };
    let callCount = 0;
    const pollRuns = vi.fn(async () => {
      callCount += 1;
      return [makeRun({ status: callCount > POLL_FAST_COUNT + 1 ? 'done' : 'running' })];
    });

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs: 10_000_000,
      now,
      sleep,
    });

    expect(result.kind).toBe('done');
    expect(recordedDurations).toHaveLength(POLL_FAST_COUNT + 1);
    for (let i = 0; i < POLL_FAST_COUNT; i += 1) {
      expect(recordedDurations[i]).toBe(POLL_FAST_MS);
    }
    expect(recordedDurations[POLL_FAST_COUNT]).toBe(POLL_SLOW_MS);
  });

  it('treats a run id missing from the poll result as still running, bounded by the budget', async () => {
    const { now, sleep } = fakeClock();
    const pollRuns = vi.fn(async () => [makeRun({ run_id: 'other-run', status: 'done' })]);
    const budgetMs = POLL_FAST_MS * 2;

    const result = await waitForRun({
      pollRuns,
      runId: 'r1',
      budgetMs,
      now,
      sleep,
    });

    expect(result.kind).toBe('budget_exceeded');
    if (result.kind === 'budget_exceeded') {
      expect(result.elapsedMs).toBe(budgetMs);
    }
    expect(pollRuns).toHaveBeenCalledTimes(3);
  });
});
