import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type {
  BriefSummaries,
  PrFindings,
  SmartDiffFileRow,
  SmartDiffStore,
} from '../src/modules/smart-diff/ports.js';

const EMPTY_FINDINGS: PrFindings = {
  findings: [],
  reviewCount: 0,
  droppedSeverities: [],
};

const FILES: SmartDiffFileRow[] = [
  { path: 'server/src/modules/billing/service.ts', additions: 84, deletions: 12 },
  { path: 'client/src/lib/y.ts', additions: 5, deletions: 5 },
  { path: 'package.json', additions: 3, deletions: 1 },
  { path: 'pnpm-lock.yaml', additions: 92, deletions: 24 },
];

const HEAD_SHA = 'abc123';

function store(briefSummaries: BriefSummaries | undefined): SmartDiffStore {
  return {
    getPullSummary: async () => ({ id: 'pr-1', headSha: HEAD_SHA }),
    getFiles: async () => FILES,
    getFindings: async () => EMPTY_FINDINGS,
    getBriefSummaries: async () => briefSummaries,
  };
}

function pathsAndRoles(dto: SmartDiff | undefined) {
  return dto?.groups.map((g) => ({
    role: g.role,
    paths: g.files.map((f) => f.path),
  }));
}

describe('smart-diff pseudocode_summary read path', () => {
  it('surfaces a fresh stored summary as pseudocode_summary', async () => {
    const service = new SmartDiffService({
      store: store({
        headSha: HEAD_SHA,
        fileSummaries: [
          { path: 'server/src/modules/billing/service.ts', summary: 'Adds billing retries.' },
        ],
      }),
    });
    const dto = await service.get('ws-1', 'pr-1');

    const summarized = dto?.groups
      .flatMap((g) => g.files)
      .find((f) => f.path === 'server/src/modules/billing/service.ts');
    expect(summarized?.pseudocode_summary).toBe('Adds billing retries.');
  });

  it('omits pseudocode_summary rather than null for a file with no stored summary', async () => {
    const service = new SmartDiffService({
      store: store({
        headSha: HEAD_SHA,
        fileSummaries: [
          { path: 'server/src/modules/billing/service.ts', summary: 'Adds billing retries.' },
        ],
      }),
    });
    const dto = await service.get('ws-1', 'pr-1');

    const unsummarized = dto?.groups
      .flatMap((g) => g.files)
      .find((f) => f.path === 'client/src/lib/y.ts');
    expect(unsummarized).toBeDefined();
    expect(unsummarized && 'pseudocode_summary' in unsummarized).toBe(false);
  });

  it('omits every key when the stored brief is stale', async () => {
    const service = new SmartDiffService({
      store: store({
        headSha: 'stale-sha',
        fileSummaries: [
          { path: 'server/src/modules/billing/service.ts', summary: 'Adds billing retries.' },
        ],
      }),
    });
    const dto = await service.get('ws-1', 'pr-1');

    for (const file of dto?.groups.flatMap((g) => g.files) ?? []) {
      expect('pseudocode_summary' in file).toBe(false);
    }
  });

  it('leaves group roles and file path ordering identical with and without summaries', async () => {
    const withSummaries = new SmartDiffService({
      store: store({
        headSha: HEAD_SHA,
        fileSummaries: [
          { path: 'server/src/modules/billing/service.ts', summary: 'Adds billing retries.' },
          { path: 'client/src/lib/y.ts', summary: 'Adjusts client helper.' },
        ],
      }),
    });
    const withoutSummaries = new SmartDiffService({ store: store(undefined) });

    const withDto = await withSummaries.get('ws-1', 'pr-1');
    const withoutDto = await withoutSummaries.get('ws-1', 'pr-1');

    expect(pathsAndRoles(withDto)).toEqual(pathsAndRoles(withoutDto));
  });
});
