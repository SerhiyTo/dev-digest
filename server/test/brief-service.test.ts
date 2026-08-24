import { describe, it, expect, vi } from 'vitest';
import { PrBrief } from '@devdigest/shared';
import type {
  BlastRadiusResponse,
  FeatureModelChoice,
  LLMProvider,
  Provider,
  SmartDiffRole,
  StructuredResult,
} from '@devdigest/shared';
import { BriefService, type BriefServiceDeps } from '../src/modules/brief/service.js';
import type { GeneratedBrief } from '../src/modules/brief/domain.js';
import type {
  BeginBriefGeneration,
  BriefChangedFile,
  BriefDocumentRow,
  BriefFindingRow,
  BriefGenerationRow,
  BriefIntentRow,
  BriefPullSummary,
  BriefReviewsRead,
  BriefGenerationStore,
  BriefStore,
  FailBriefGeneration,
  FileRoleSource,
  FileSource,
  FinishBriefGeneration,
  IntentSource,
  Logger,
  PullSource,
  ReviewSource,
  UpsertBriefDocument,
  BlastSource,
} from '../src/modules/brief/ports.js';

const WORKSPACE_ID = 'workspace-1';
const PR_ID = 'pr-1';
const HEAD_SHA = 'sha-current';

function pull(overrides: Partial<BriefPullSummary> = {}): BriefPullSummary {
  return {
    id: PR_ID,
    repoId: 'repo-1',
    workspaceId: WORKSPACE_ID,
    number: 482,
    title: 'Add feature',
    body: 'A normal PR body.',
    branch: 'feature/x',
    base: 'main',
    headSha: HEAD_SHA,
    commits: [{ sha: 'aaa1111111', message: 'add feature' }],
    ...overrides,
  };
}

function changedFiles(): BriefChangedFile[] {
  return [
    {
      path: 'src/a.ts',
      additions: 2,
      deletions: 0,
      patch: ['@@ -1,1 +1,3 @@', ' context line', '+added line 1', '+added line 2'].join('\n'),
    },
  ];
}

function blast(overrides: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [],
    downstream: [],
    summary: 'No downstream impact found.',
    endpoints_affected: [],
    crons_affected: [],
    history: [],
    truncated: false,
    degraded: false,
    reason: '',
    ...overrides,
  };
}

function generatedBrief(overrides: Partial<GeneratedBrief> = {}): GeneratedBrief {
  return {
    summary: 'This PR adds a feature.',
    risks: [
      {
        kind: 'data-loss',
        title: 'Possible data loss',
        explanation: 'Explanation of the risk.',
        severity: 'medium',
        file_refs: ['src/a.ts:2'],
      },
    ],
    review_focus: [{ file: 'src/a.ts', start_line: 2, end_line: 2, reason: 'Check this line' }],
    file_summaries: [{ path: 'src/a.ts', summary: 'Adds a feature.' }],
    ...overrides,
  };
}

function structuredResult(data: GeneratedBrief, overrides: Partial<StructuredResult<GeneratedBrief>> = {}): StructuredResult<GeneratedBrief> {
  return {
    data,
    model: 'gpt-test',
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.02,
    raw: JSON.stringify(data),
    attempts: 1,
    ...overrides,
  };
}

class FakeBriefStore implements BriefStore {
  rows = new Map<string, BriefDocumentRow>();
  upsertCalls: UpsertBriefDocument[] = [];

  async readBrief(prId: string): Promise<BriefDocumentRow | undefined> {
    return this.rows.get(prId);
  }

  async upsertBrief(values: UpsertBriefDocument): Promise<void> {
    this.upsertCalls.push(values);
    this.rows.set(values.prId, {
      json: values.json,
      headSha: values.headSha,
      model: values.model,
      provider: values.provider,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd,
      degradedReason: values.degradedReason,
      truncated: values.truncated,
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  }
}

class FakeGenerationStore implements BriefGenerationStore {
  generation: BriefGenerationRow | undefined;
  beginCalls: BeginBriefGeneration[] = [];
  finishCalls: FinishBriefGeneration[] = [];
  failCalls: FailBriefGeneration[] = [];
  reapCalls = 0;

  async readGeneration(): Promise<BriefGenerationRow | undefined> {
    return this.generation;
  }

  async beginGeneration(values: BeginBriefGeneration): Promise<boolean> {
    this.beginCalls.push(values);
    this.generation = {
      prId: values.prId,
      workspaceId: values.workspaceId,
      status: 'running',
      provider: null,
      model: null,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      degradedReason: null,
      error: null,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      finishedAt: null,
    };
    return true;
  }

  async finishGeneration(prId: string, patch: FinishBriefGeneration): Promise<void> {
    this.finishCalls.push(patch);
    this.generation = {
      prId,
      workspaceId: WORKSPACE_ID,
      status: 'done',
      provider: patch.provider,
      model: patch.model,
      tokensIn: patch.tokensIn,
      tokensOut: patch.tokensOut,
      costUsd: patch.costUsd,
      degradedReason: patch.degradedReason,
      error: null,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      finishedAt: new Date('2026-01-01T00:01:00Z'),
    };
  }

  async failGeneration(prId: string, patch: FailBriefGeneration): Promise<void> {
    this.failCalls.push(patch);
    this.generation = {
      prId,
      workspaceId: WORKSPACE_ID,
      status: 'failed',
      provider: patch.provider,
      model: patch.model,
      tokensIn: patch.tokensIn,
      tokensOut: patch.tokensOut,
      costUsd: patch.costUsd,
      degradedReason: null,
      error: patch.error,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      finishedAt: new Date('2026-01-01T00:01:00Z'),
    };
  }

  async reapRunning(): Promise<number> {
    this.reapCalls += 1;
    return 0;
  }
}

class FakeIntentSource implements IntentSource {
  async readIntent(): Promise<BriefIntentRow | undefined> {
    return undefined;
  }
}

class FakeReviewSource implements ReviewSource {
  async readReviews(): Promise<BriefReviewsRead> {
    return { latest: null, distinctModels: ['claude-sonnet-5'] };
  }

  async readFindings(): Promise<BriefFindingRow[]> {
    return [{ file: 'src/z-file.ts', startLine: 1, endLine: 1, severity: 'CRITICAL' }];
  }
}

class FakePullSource implements PullSource {
  constructor(private readonly summary: BriefPullSummary = pull()) {}

  async getPullSummary(): Promise<BriefPullSummary | undefined> {
    return this.summary;
  }
}

class FakeFileSource implements FileSource {
  constructor(private readonly files: BriefChangedFile[] = changedFiles()) {}

  async getChangedFiles(): Promise<BriefChangedFile[]> {
    return this.files;
  }
}

class FakeBlastSource implements BlastSource {
  constructor(private readonly result: BlastRadiusResponse | undefined = blast()) {}

  async get(): Promise<BlastRadiusResponse | undefined> {
    return this.result;
  }
}

class FakeFileRoleSource implements FileRoleSource {
  async get(): Promise<ReadonlyMap<string, SmartDiffRole> | undefined> {
    return new Map<string, SmartDiffRole>([['src/a.ts', 'core']]);
  }
}

class FakeFeatureModelResolver {
  async resolve(): Promise<FeatureModelChoice> {
    return { provider: 'openai' as Provider, model: 'gpt-test' };
  }
}

interface LogEntry {
  level: 'info' | 'warn' | 'error';
  obj: unknown;
  msg?: string;
}

function fakeLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const logger: Logger = {
    info: (obj, msg) => entries.push({ level: 'info', obj, msg }),
    warn: (obj, msg) => entries.push({ level: 'warn', obj, msg }),
    error: (obj, msg) => entries.push({ level: 'error', obj, msg }),
  };
  return { logger, entries };
}

function fakeLlmProvider(completeStructured: LLMProvider['completeStructured']): LLMProvider {
  return {
    id: 'openai',
    listModels: async () => {
      throw new Error('not used in this test');
    },
    complete: async () => {
      throw new Error('not used in this test');
    },
    completeStructured,
    embed: async () => {
      throw new Error('not used in this test');
    },
  };
}

interface Harness {
  service: BriefService;
  briefStore: FakeBriefStore;
  generationStore: FakeGenerationStore;
  blastSource: FakeBlastSource;
  fileSource: FakeFileSource;
  entries: LogEntry[];
  completeStructured: ReturnType<typeof vi.fn>;
}

function buildHarness(overrides: {
  pullSource?: PullSource;
  reviewSource?: ReviewSource;
  blastSource?: FakeBlastSource;
  fileSource?: FakeFileSource;
  completeStructuredImpl?: (req: unknown) => Promise<StructuredResult<GeneratedBrief>>;
} = {}): Harness {
  const briefStore = new FakeBriefStore();
  const generationStore = new FakeGenerationStore();
  const blastSourceInstance = overrides.blastSource ?? new FakeBlastSource();
  const fileSourceInstance = overrides.fileSource ?? new FakeFileSource();
  const { logger, entries } = fakeLogger();

  const completeStructured = vi.fn(
    overrides.completeStructuredImpl ?? (async () => structuredResult(generatedBrief())),
  );

  const deps: BriefServiceDeps = {
    briefStore,
    generationStore,
    intentSource: new FakeIntentSource(),
    reviewSource: overrides.reviewSource ?? new FakeReviewSource(),
    pullSource: overrides.pullSource ?? new FakePullSource(),
    fileSource: fileSourceInstance,
    blastSource: blastSourceInstance,
    fileRoleSource: new FakeFileRoleSource(),
    featureModels: new FakeFeatureModelResolver(),
    llm: async () => fakeLlmProvider(completeStructured as unknown as LLMProvider['completeStructured']),
    logger,
  };

  return {
    service: new BriefService(deps),
    briefStore,
    generationStore,
    blastSource: blastSourceInstance,
    fileSource: fileSourceInstance,
    entries,
    completeStructured,
  };
}

function storedDocument(overrides: Record<string, unknown> = {}) {
  return {
    intent: { intent: '', in_scope: [], out_of_scope: [], risk_areas: [], evidence: [], confidence: null },
    blast: { changed_symbols: [], downstream: [], summary: 'none' },
    risks: { risks: [] },
    history: { history: [] },
    summary: 'Existing stored summary',
    merge_risk: 'low',
    review_focus: [],
    file_summaries: [],
    degraded_reason: null,
    truncated: false,
    head_sha: HEAD_SHA,
    model: 'gpt-old',
    review_models: [],
    tokens_in: 5,
    tokens_out: 5,
    cost_usd: 0.001,
    ...overrides,
  };
}

describe('BriefService.get', () => {
  it('returns the stored brief with zero provider calls (AC-36)', async () => {
    const harness = buildHarness();
    await harness.briefStore.upsertBrief({
      prId: PR_ID,
      json: storedDocument(),
      headSha: HEAD_SHA,
      model: 'gpt-old',
      provider: 'openai',
      tokensIn: 5,
      tokensOut: 5,
      costUsd: 0.001,
      degradedReason: null,
      truncated: false,
    });

    const response = await harness.service.get(WORKSPACE_ID, PR_ID);

    expect(response.brief?.summary).toBe('Existing stored summary');
    expect(response.stale).toBe(false);
    expect(harness.completeStructured).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a PR outside the workspace (AC-68)', async () => {
    const harness = buildHarness({
      pullSource: { getPullSummary: async () => undefined },
    });

    await expect(harness.service.get(WORKSPACE_ID, PR_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('BriefService.runGeneration', () => {
  it('makes exactly one provider call and persists a document that parses against PrBrief (AC-22, AC-46, AC-58)', async () => {
    const harness = buildHarness();

    await harness.service.runGeneration(WORKSPACE_ID, PR_ID);

    expect(harness.completeStructured).toHaveBeenCalledTimes(1);
    expect(harness.briefStore.upsertCalls).toHaveLength(1);
    expect(harness.generationStore.finishCalls).toHaveLength(1);
    expect(harness.generationStore.generation?.status).toBe('done');

    const stored = harness.briefStore.rows.get(PR_ID);
    const parsed = PrBrief.safeParse(stored?.json);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.review_models).toEqual(['claude-sonnet-5']);
  });

  it('still produces a brief with the degraded reason stored when the blast result is degraded (AC-30, AC-32)', async () => {
    const harness = buildHarness({
      blastSource: new FakeBlastSource(blast({ degraded: true, reason: 'repository not indexed' })),
    });

    await harness.service.runGeneration(WORKSPACE_ID, PR_ID);

    expect(harness.generationStore.generation?.status).toBe('done');
    const stored = harness.briefStore.rows.get(PR_ID);
    expect(stored?.degradedReason).toBe('repository not indexed');
    const parsed = PrBrief.safeParse(stored?.json);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.degraded_reason).toBe('repository not indexed');
  });

  it('leaves the previously stored document byte-identical on failure and records the error (AC-47, AC-49)', async () => {
    const harness = buildHarness({
      completeStructuredImpl: async () => {
        throw new Error('provider exploded');
      },
    });
    const existing = storedDocument({ summary: 'Untouched summary' });
    await harness.briefStore.upsertBrief({
      prId: PR_ID,
      json: existing,
      headSha: HEAD_SHA,
      model: 'gpt-old',
      provider: 'openai',
      tokensIn: 5,
      tokensOut: 5,
      costUsd: 0.001,
      degradedReason: null,
      truncated: false,
    });

    await expect(harness.service.runGeneration(WORKSPACE_ID, PR_ID)).resolves.toBeUndefined();

    expect(harness.briefStore.upsertCalls).toHaveLength(1);
    expect(harness.briefStore.rows.get(PR_ID)?.json).toEqual(existing);
    expect(harness.generationStore.failCalls).toHaveLength(1);
    expect(harness.generationStore.failCalls[0]?.error).toContain('provider exploded');
    expect(harness.generationStore.generation?.status).toBe('failed');
  });

  it('orders persisted review-focus rows by intersecting-finding severity, not by path alone (AC-26)', async () => {
    const harness = buildHarness({
      fileSource: new FakeFileSource([
        {
          path: 'src/a-file.ts',
          additions: 1,
          deletions: 0,
          patch: ['@@ -5,1 +5,1 @@', '-old', '+new'].join('\n'),
        },
        {
          path: 'src/z-file.ts',
          additions: 1,
          deletions: 0,
          patch: ['@@ -1,1 +1,1 @@', '-old', '+new'].join('\n'),
        },
      ]),
      completeStructuredImpl: async () =>
        structuredResult(
          generatedBrief({
            risks: [],
            review_focus: [
              { file: 'src/a-file.ts', start_line: 5, end_line: 5, reason: 'intersects no finding' },
              { file: 'src/z-file.ts', start_line: 1, end_line: 1, reason: 'intersects a CRITICAL finding' },
            ],
          }),
        ),
    });

    await harness.service.runGeneration(WORKSPACE_ID, PR_ID);

    const stored = harness.briefStore.rows.get(PR_ID);
    const parsed = PrBrief.safeParse(stored?.json);
    expect(parsed.success).toBe(true);
    const order = parsed.success ? parsed.data.review_focus.map((row) => row.file) : [];
    expect(order).toEqual(['src/z-file.ts', 'src/a-file.ts']);
  });

  it('ranks a focus row by the worst of several intersecting findings and breaks ties by path then start line (AC-26)', async () => {
    class MultiFindingReviewSource implements ReviewSource {
      async readReviews(): Promise<BriefReviewsRead> {
        return { latest: null, distinctModels: [] };
      }

      async readFindings(): Promise<BriefFindingRow[]> {
        return [
          { file: 'src/b-file.ts', startLine: 1, endLine: 3, severity: 'SUGGESTION' },
          { file: 'src/b-file.ts', startLine: 2, endLine: 2, severity: 'WARNING' },
        ];
      }
    }

    const harness = buildHarness({
      reviewSource: new MultiFindingReviewSource(),
      fileSource: new FakeFileSource([
        {
          path: 'src/a-file.ts',
          additions: 1,
          deletions: 0,
          patch: ['@@ -1,1 +1,1 @@', '-old', '+new'].join('\n'),
        },
        {
          path: 'src/b-file.ts',
          additions: 1,
          deletions: 0,
          patch: ['@@ -1,3 +1,3 @@', '-old1', '-old2', '-old3', '+new1', '+new2', '+new3'].join('\n'),
        },
      ]),
      completeStructuredImpl: async () =>
        structuredResult(
          generatedBrief({
            risks: [],
            review_focus: [
              { file: 'src/a-file.ts', start_line: 1, end_line: 1, reason: 'intersects no finding' },
              { file: 'src/b-file.ts', start_line: 2, end_line: 2, reason: 'intersects both findings' },
            ],
          }),
        ),
    });

    await harness.service.runGeneration(WORKSPACE_ID, PR_ID);

    const stored = harness.briefStore.rows.get(PR_ID);
    const parsed = PrBrief.safeParse(stored?.json);
    expect(parsed.success).toBe(true);
    const order = parsed.success ? parsed.data.review_focus.map((row) => row.file) : [];
    expect(order).toEqual(['src/b-file.ts', 'src/a-file.ts']);
  });

  it('logs counts on success and never logs the prompt or patch text (AC-14, AC-24)', async () => {
    const harness = buildHarness({
      completeStructuredImpl: async () =>
        structuredResult(
          generatedBrief({
            risks: [
              {
                kind: 'data-loss',
                title: 'Possible data loss',
                explanation: 'Explanation',
                severity: 'medium',
                file_refs: ['src/a.ts:2', 'src/fabricated.ts'],
              },
            ],
            review_focus: [
              { file: 'src/a.ts', start_line: 2, end_line: 2, reason: 'in range' },
              { file: 'src/a.ts', start_line: 999, end_line: 999, reason: 'out of range' },
            ],
          }),
        ),
    });

    await harness.service.runGeneration(WORKSPACE_ID, PR_ID);

    const finished = harness.entries.find((entry) => entry.msg === 'brief: generation finished');
    expect(finished).toBeTruthy();
    const finishedObj = finished?.obj as Record<string, unknown>;
    expect(typeof finishedObj.tokensIn).toBe('number');
    expect(typeof finishedObj.tokensOut).toBe('number');
    expect(typeof finishedObj.costUsd).toBe('number');
    expect(finishedObj.droppedRefCount).toBe(1);
    expect(finishedObj.droppedFocusCount).toBe(1);

    const warnings = harness.entries.filter((entry) => entry.level === 'warn');
    expect(warnings.some((entry) => entry.msg === 'brief: dropped ungrounded file refs')).toBe(true);
    expect(warnings.some((entry) => entry.msg === 'brief: dropped review-focus rows outside every hunk')).toBe(true);

    const serializedLog = JSON.stringify(harness.entries);
    expect(serializedLog).not.toContain('added line 1');
    expect(serializedLog).not.toContain('added line 2');
    expect(serializedLog).not.toContain('A normal PR body.');
  });
});

describe('BriefService.beginGeneration', () => {
  it('raises a conflict when a generation is genuinely already running (AC-42)', async () => {
    const harness = buildHarness();
    harness.generationStore.beginGeneration = async () => false;

    await expect(harness.service.beginGeneration(WORKSPACE_ID, PR_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
