import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { SmartDiff } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

const FILES = [
  { path: 'server/src/modules/billing/service.ts', additions: 84, deletions: 12, patch: PATCH },
  { path: 'client/src/lib/x.ts', additions: 20, deletions: 3, patch: PATCH },
  { path: 'package.json', additions: 3, deletions: 1, patch: PATCH },
  { path: 'server/src/db/migrations/0020_x.sql', additions: 12, deletions: 0, patch: PATCH },
  { path: 'pnpm-lock.yaml', additions: 92, deletions: 24, patch: PATCH },
  { path: 'client/dist/bundle.js', additions: 500, deletions: 40, patch: PATCH },
  { path: 'server/src/modules/billing/binary.bin', additions: 1, deletions: 0, patch: null },
];

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'feat: add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 712,
      deletions: 80,
      filesCount: FILES.length,
      status: 'needs_review',
      body: null,
    })
    .returning();
  await db.insert(t.prFiles).values(FILES.map((file) => ({ prId: pr!.id, ...file })));
  return { repo: repo!, pr: pr! };
}

interface FindingSeed {
  file: string;
  startLine: number;
  endLine?: number;
  severity: string;
  dismissed?: boolean;
}

async function addReview(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  kind: 'review' | 'summary',
  findings: FindingSeed[],
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, kind, verdict: 'request_changes', summary: 's', score: 42 })
    .returning();
  if (findings.length > 0) {
    await db.insert(t.findings).values(
      findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.startLine,
        endLine: f.endLine ?? f.startLine,
        severity: f.severity,
        category: 'security',
        title: 'seeded finding',
        rationale: 'seeded',
        confidence: 0.9,
        dismissedAt: f.dismissed ? new Date() : null,
      })),
    );
  }
  return review!;
}

function groupOf(body: SmartDiff, role: 'core' | 'wiring' | 'boilerplate') {
  return body.groups.find((g) => g.role === role);
}

function linesFor(body: SmartDiff, path: string): number[] | undefined {
  for (const group of body.groups) {
    const file = group.files.find((f) => f.path === path);
    if (file) return file.finding_lines;
  }
  return undefined;
}

d('Smart Diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function app() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), github: new MockGitHubClient() },
    });
  }

  it('groups files by role with no overlays before any review', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);

    const body = res.json() as SmartDiff;
    expect(() => SmartDiff.parse(body)).not.toThrow();
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);

    expect(groupOf(body, 'core')?.files.map((f) => f.path).sort()).toEqual([
      'client/src/lib/x.ts',
      'server/src/modules/billing/service.ts',
    ]);
    expect(groupOf(body, 'wiring')?.files.map((f) => f.path).sort()).toEqual([
      'package.json',
      'server/src/db/migrations/0020_x.sql',
    ]);
    expect(groupOf(body, 'boilerplate')?.files.map((f) => f.path).sort()).toEqual([
      'client/dist/bundle.js',
      'pnpm-lock.yaml',
      'server/src/modules/billing/binary.bin',
    ]);

    const everyFile = body.groups.flatMap((g) => g.files);
    expect(everyFile).toHaveLength(FILES.length);
    expect(everyFile.every((f) => f.finding_lines.length === 0)).toBe(true);
  });

  it('counts total_lines over every file yet excludes boilerplate from too_big', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const body = (
      await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })
    ).json() as SmartDiff;

    const expected = FILES.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    expect(body.split_suggestion.total_lines).toBe(expected);
    expect(body.split_suggestion.too_big).toBe(false);
    expect(body.split_suggestion.proposed_splits).toEqual([]);
  });

  it('lifts the findings-bearing core file to the top and fills its finding_lines', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    await addReview(pg.handle.db, workspaceId, pr.id, 'review', [
      { file: 'client/src/lib/x.ts', startLine: 28, severity: 'CRITICAL' },
      { file: 'client/src/lib/x.ts', startLine: 52, endLine: 53, severity: 'WARNING' },
      { file: 'server/src/modules/billing/service.ts', startLine: 4, severity: 'SUGGESTION' },
    ]);

    const body = (
      await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })
    ).json() as SmartDiff;

    const core = groupOf(body, 'core');
    expect(core?.files[0]?.path).toBe('client/src/lib/x.ts');
    expect(core?.files[0]?.finding_lines).toEqual([28, 52, 53]);
    expect(core?.files[1]?.finding_lines).toEqual([4]);
  });

  it('excludes a dismissed finding', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    await addReview(pg.handle.db, workspaceId, pr.id, 'review', [
      { file: 'client/src/lib/x.ts', startLine: 28, severity: 'CRITICAL', dismissed: true },
      { file: 'client/src/lib/x.ts', startLine: 30, severity: 'WARNING' },
    ]);

    const body = (
      await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })
    ).json() as SmartDiff;

    expect(linesFor(body, 'client/src/lib/x.ts')).toEqual([30]);
  });

  it('keeps the overlays when a newer summary review carries no findings', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const review = await addReview(pg.handle.db, workspaceId, pr.id, 'review', [
      { file: 'client/src/lib/x.ts', startLine: 12, severity: 'CRITICAL' },
    ]);
    const summary = await addReview(pg.handle.db, workspaceId, pr.id, 'summary', []);

    const [reviewRow] = await pg.handle.db
      .select({ createdAt: t.reviews.createdAt })
      .from(t.reviews)
      .where(eq(t.reviews.id, review.id));
    await pg.handle.db
      .update(t.reviews)
      .set({ createdAt: new Date(reviewRow!.createdAt.getTime() + 60_000) })
      .where(eq(t.reviews.id, summary.id));

    const body = (
      await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })
    ).json() as SmartDiff;

    expect(linesFor(body, 'client/src/lib/x.ts')).toEqual([12]);
  });

  it('ignores a finding on a path absent from the diff without failing', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    await addReview(pg.handle.db, workspaceId, pr.id, 'review', [
      { file: 'server/src/gone.ts', startLine: 4, severity: 'CRITICAL' },
    ]);

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);

    const body = res.json() as SmartDiff;
    expect(body.groups.flatMap((g) => g.files.map((f) => f.path))).not.toContain(
      'server/src/gone.ts',
    );
    expect(body.groups.every((g) => g.files.every((f) => f.finding_lines.length === 0))).toBe(true);
  });

  it('ignores an unknown severity string', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    await addReview(pg.handle.db, workspaceId, pr.id, 'review', [
      { file: 'client/src/lib/x.ts', startLine: 9, severity: 'blocker' },
      { file: 'client/src/lib/x.ts', startLine: 11, severity: 'WARNING' },
    ]);

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    expect(linesFor(res.json() as SmartDiff, 'client/src/lib/x.ts')).toEqual([11]);
  });

  it('404s for an unknown pull request and 422s for a non-uuid', async () => {
    const server = await app();

    const missing = await server.inject({
      method: 'GET',
      url: '/pulls/11111111-1111-4111-8111-111111111111/smart-diff',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');

    const bad = await server.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_error');
  });
});
