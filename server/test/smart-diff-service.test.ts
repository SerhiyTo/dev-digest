import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type {
  LatestReviewFindings,
  Logger,
  SmartDiffFileRow,
  SmartDiffFindingRow,
  SmartDiffStore,
} from '../src/modules/smart-diff/ports.js';

interface LogLine {
  level: 'info' | 'warn' | 'error';
  obj: Record<string, unknown>;
  msg?: string;
}

function spyLogger(): { logger: Logger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const push = (level: LogLine['level']) => (obj: unknown, msg?: string) =>
    lines.push({ level, obj: obj as Record<string, unknown>, msg });
  return {
    lines,
    logger: { info: push('info'), warn: push('warn'), error: push('error') },
  };
}

const EMPTY_LATEST: LatestReviewFindings = {
  reviewId: null,
  kind: null,
  fellBackToSummary: false,
  findings: [],
  droppedSeverities: [],
};

function store(
  files: SmartDiffFileRow[],
  latest: Partial<LatestReviewFindings> = {},
  pullExists = true,
): SmartDiffStore {
  return {
    getPullSummary: async () => (pullExists ? { id: 'pr-1' } : undefined),
    getFiles: async () => files,
    getLatestReviewFindings: async () => ({ ...EMPTY_LATEST, ...latest }),
  };
}

function finding(
  file: string,
  startLine: number,
  severity: string,
  endLine = startLine,
): SmartDiffFindingRow {
  return { file, startLine, endLine, severity };
}

const MIXED: SmartDiffFileRow[] = [
  { path: 'server/src/modules/billing/service.ts', additions: 84, deletions: 12 },
  { path: 'client/src/lib/y.ts', additions: 5, deletions: 5 },
  { path: 'package.json', additions: 3, deletions: 1 },
  { path: 'pnpm-lock.yaml', additions: 92, deletions: 24 },
];

function messages(lines: LogLine[], level: LogLine['level']): (string | undefined)[] {
  return lines.filter((l) => l.level === level).map((l) => l.msg);
}

describe('SmartDiffService', () => {
  it('returns undefined for a PR outside the workspace', async () => {
    const service = new SmartDiffService({ store: store([], {}, false) });
    expect(await service.get('ws-1', 'pr-1')).toBeUndefined();
  });

  it('produces a contract-valid response with no findings before any review', async () => {
    const service = new SmartDiffService({ store: store(MIXED) });
    const dto = await service.get('ws-1', 'pr-1');

    expect(() => SmartDiff.parse(dto)).not.toThrow();
    expect(dto?.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(dto?.groups.every((g) => g.files.every((f) => f.finding_lines.length === 0))).toBe(true);
  });

  it('omits pseudocode_summary rather than emitting null', async () => {
    const service = new SmartDiffService({ store: store(MIXED) });
    const dto = await service.get('ws-1', 'pr-1');
    const first = dto?.groups[0]?.files[0];
    expect(first && 'pseudocode_summary' in first).toBe(false);
  });

  it('puts the CRITICAL-bearing file at the top of core with its lines', async () => {
    const service = new SmartDiffService({
      store: store(MIXED, {
        reviewId: 'rev-1',
        kind: 'review',
        findings: [
          finding('client/src/lib/y.ts', 28, 'CRITICAL'),
          finding('client/src/lib/y.ts', 52, 'WARNING', 53),
          finding('server/src/modules/billing/service.ts', 4, 'SUGGESTION'),
        ],
      }),
    });
    const dto = await service.get('ws-1', 'pr-1');
    const core = dto?.groups.find((g) => g.role === 'core');
    expect(core?.files[0]?.path).toBe('client/src/lib/y.ts');
    expect(core?.files[0]?.finding_lines).toEqual([28, 52, 53]);
  });

  it('warns once when findings reference a file absent from the diff', async () => {
    const { logger, lines } = spyLogger();
    const service = new SmartDiffService({
      store: store(MIXED, {
        reviewId: 'rev-1',
        kind: 'review',
        findings: [finding('server/src/gone.ts', 4, 'CRITICAL')],
      }),
      logger,
    });
    const dto = await service.get('ws-1', 'pr-1');

    const orphan = lines.filter(
      (l) => l.msg === 'smart-diff: findings reference files absent from the diff',
    );
    expect(orphan).toHaveLength(1);
    expect(orphan[0]?.obj.sample).toEqual(['server/src/gone.ts']);
    expect(dto?.groups.flatMap((g) => g.files.map((f) => f.path))).not.toContain(
      'server/src/gone.ts',
    );
  });

  it('warns per distinct unknown severity without disturbing the order', async () => {
    const { logger, lines } = spyLogger();
    const service = new SmartDiffService({
      store: store(MIXED, {
        reviewId: 'rev-1',
        kind: 'review',
        droppedSeverities: [
          { severity: 'INFO', count: 3 },
          { severity: '', count: 1 },
        ],
      }),
      logger,
    });
    const dto = await service.get('ws-1', 'pr-1');

    const unknown = lines.filter((l) => l.msg === 'smart-diff: unknown finding severity ignored');
    expect(unknown).toHaveLength(2);
    expect(unknown[0]?.obj.count).toBe(3);
    expect(dto?.groups.find((g) => g.role === 'core')?.files[0]?.path).toBe(
      'server/src/modules/billing/service.ts',
    );
  });

  it('uses the review-kind row without a fallback warning', async () => {
    const { logger, lines } = spyLogger();
    const service = new SmartDiffService({
      store: store(MIXED, {
        reviewId: 'rev-1',
        kind: 'review',
        findings: [finding('client/src/lib/y.ts', 7, 'WARNING')],
      }),
      logger,
    });
    const dto = await service.get('ws-1', 'pr-1');

    expect(messages(lines, 'warn')).not.toContain(
      'smart-diff: no review-kind review; using latest summary',
    );
    expect(dto?.groups.find((g) => g.role === 'core')?.files[0]?.finding_lines).toEqual([7]);
  });

  it('warns when only a summary review exists', async () => {
    const { logger, lines } = spyLogger();
    const service = new SmartDiffService({
      store: store(MIXED, { reviewId: 'rev-9', kind: 'summary', fellBackToSummary: true }),
      logger,
    });
    await service.get('ws-1', 'pr-1');

    expect(messages(lines, 'warn')).toContain(
      'smart-diff: no review-kind review; using latest summary',
    );
  });

  it('returns an empty model for a PR with no files', async () => {
    const { logger, lines } = spyLogger();
    const service = new SmartDiffService({ store: store([]), logger });
    const dto = await service.get('ws-1', 'pr-1');

    expect(dto).toEqual({
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });
    expect(messages(lines, 'warn')).toContain('smart-diff: pull request has no files');
  });

  it('logs exactly one computed line carrying the group counts', async () => {
    const { logger, lines } = spyLogger();
    const service = new SmartDiffService({ store: store(MIXED), logger });
    await service.get('ws-1', 'pr-1');

    const computed = lines.filter((l) => l.msg === 'smart-diff: computed');
    expect(computed).toHaveLength(1);
    expect(computed[0]?.level).toBe('info');
    expect(computed[0]?.obj).toMatchObject({
      files: 4,
      core: 2,
      wiring: 1,
      boilerplate: 1,
      findingFiles: 0,
      tooBig: false,
    });
  });

  it('never logs patch text or finding prose', async () => {
    const { logger, lines } = spyLogger();
    const service = new SmartDiffService({
      store: store(MIXED, {
        reviewId: 'rev-1',
        kind: 'review',
        findings: [finding('client/src/lib/y.ts', 7, 'WARNING')],
      }),
      logger,
    });
    await service.get('ws-1', 'pr-1');

    for (const line of lines) {
      expect(Object.keys(line.obj)).not.toContain('patch');
      expect(Object.keys(line.obj)).not.toContain('title');
      expect(Object.keys(line.obj)).not.toContain('rationale');
    }
  });
});
