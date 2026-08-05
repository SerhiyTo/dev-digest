import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const USERS_TS = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
].join('\n');

const REDIS_TS = ["import Redis from 'ioredis';", '', 'export const redis = new Redis(url);'].join(
  '\n',
);

const FILES = { 'src/api/users.ts': USERS_TS, 'src/lib/redis.ts': REDIS_TS };
const SAMPLES = ['src/api/users.ts', 'src/lib/redis.ts', 'src/config.ts'];

const SELECTION = {
  files: [
    { path: 'src/api/users.ts', reason: 'route handlers' },
    { path: 'src/lib/redis.ts', reason: 'shared client' },
    { path: 'src/invented.ts', reason: 'does not exist' },
  ],
};

const EXTRACTION = {
  conventions: [
    {
      rule: 'Always use async/await instead of .then() chains.',
      evidence: [
        {
          path: 'src/api/users.ts',
          start_line: 99,
          end_line: 99,
          snippet: '  const user = await db.users.find(id);',
        },
      ],
      probe: 'await db\\.',
      confidence: 0.91,
    },
    {
      rule: 'Redis access goes through a single exported singleton.',
      evidence: [
        {
          path: 'src/lib/redis.ts',
          start_line: 3,
          end_line: 3,
          snippet: 'export const redis = new Redis(url);',
        },
      ],
      probe: '',
      confidence: 0.85,
    },
    {
      rule: 'Every handler validates its input with a zod schema.',
      evidence: [
        {
          path: 'src/api/users.ts',
          start_line: 1,
          end_line: 1,
          snippet: 'const parsed = UserSchema.parse(req.body);',
        },
      ],
      probe: '',
      confidence: 0.6,
    },
  ],
};

/**
 * The conventions extractor end-to-end over a real Postgres: the two-step model
 * dialogue, the grounding gate, triage, the re-scan carry-over, and the merge
 * into a skill that the creation gate keeps disabled.
 */
d('conventions module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.conventions).where(eq(t.conventions.repoId, repoId));
    await pg.handle.db.delete(t.conventionScans).where(eq(t.conventionScans.repoId, repoId));
  });

  function makeApp(opts: { samples?: string[]; llm?: MockLLMProvider } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm =
      opts.llm ??
      new MockLLMProvider('openai', {
        structuredBySchema: {
          ConventionFileSelection: SELECTION,
          ConventionExtraction: EXTRACTION,
        },
      });
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        repoIntel: {
          getConventionSamples: async () => opts.samples ?? SAMPLES,
          getIndexState: async () => ({ status: 'degraded' }),
        } as never,
        codeIndex: {
          grep: async () => [
            { path: 'src/api/users.ts', line: 4, text: 'await db.users.find(id)' },
            { path: 'src/api/orders.ts', line: 9, text: 'await db.orders.find(id)' },
          ],
          symbols: async () => [],
          references: async () => [],
        },
      },
    });
  }

  /** The scan is fire-and-forget, so wait on the status it reports for itself. */
  async function waitForScan(app: Awaited<ReturnType<typeof makeApp>>, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const view = (
        await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })
      ).json();
      if (view.state.status !== 'running') return view;
      if (Date.now() > deadline) throw new Error('scan did not finish in time');
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  async function runScan(app: Awaited<ReturnType<typeof makeApp>>, payload: object = {}) {
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/scan`,
      payload,
    });
    expect(res.statusCode).toBe(202);
    await waitForScan(app);
    return res.json();
  }

  async function listConventions(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  // ---- the two-step pipeline ----------------------------------------------

  it('runs the two-step dialogue and lands grounded candidates as pending', async () => {
    const app = await makeApp();
    await runScan(app);

    const { state, candidates } = await listConventions(app);

    expect(state.status).toBe('done');
    expect(state.sampled_files).toBe(SAMPLES.length);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c: { status: string }) => c.status === 'pending')).toBe(true);
    await app.close();
  });

  it('calls the model twice, by the schema names the starter documents', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionFileSelection: SELECTION,
        ConventionExtraction: EXTRACTION,
      },
    });
    const app = await makeApp({ llm });
    await runScan(app);

    const structured = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structured.map((c) => (c.req as { schemaName: string }).schemaName)).toEqual([
      'ConventionFileSelection',
      'ConventionExtraction',
    ]);
    await app.close();
  });

  it('sends only the selected, real paths into the extraction prompt', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionFileSelection: SELECTION,
        ConventionExtraction: EXTRACTION,
      },
    });
    const app = await makeApp({ llm });
    await runScan(app);

    const extraction = llm.calls.filter((c) => c.method === 'completeStructured')[1]!;
    const prompt = (extraction.req as { messages: { content: string }[] }).messages[0]!.content;

    expect(prompt).toContain('==== src/api/users.ts ====');
    expect(prompt).toContain('==== src/lib/redis.ts ====');
    expect(prompt).not.toContain('src/invented.ts');
    expect(prompt).not.toContain('==== src/config.ts ====');
    await app.close();
  });

  it('drops a fabricated snippet and reports why', async () => {
    const app = await makeApp();
    await runScan(app);

    const { state, candidates } = await listConventions(app);

    expect(state.candidate_count).toBe(2);
    expect(state.dropped_count).toBe(1);
    expect(state.dropped_reasons).toEqual({ snippet_not_found: 1 });
    expect(candidates.map((c: { rule: string }) => c.rule)).not.toContain(
      'Every handler validates its input with a zod schema.',
    );
    await app.close();
  });

  it('recomputes evidence line numbers from the file, not from the model', async () => {
    const app = await makeApp();
    await runScan(app);

    const { candidates } = await listConventions(app);
    const asyncRule = candidates.find((c: { rule: string }) => c.rule.startsWith('Always use'));

    expect(asyncRule.evidence[0]).toMatchObject({ start_line: 4, end_line: 4 });
    await app.close();
  });

  it('counts occurrences only when a probe was supplied', async () => {
    const app = await makeApp();
    await runScan(app);

    const { candidates } = await listConventions(app);
    const withProbe = candidates.find((c: { rule: string }) => c.rule.startsWith('Always use'));
    const withoutProbe = candidates.find((c: { rule: string }) => c.rule.startsWith('Redis'));

    expect(withProbe.occurrence_files).toBe(2);
    expect(withoutProbe.occurrence_files).toBeNull();
    await app.close();
  });

  it('finishes done with zero model calls when the repo is not indexed', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: {} });
    const app = await makeApp({ samples: [], llm });
    await runScan(app);

    const { state, candidates } = await listConventions(app);

    expect(state.status).toBe('done');
    expect(state.degraded_reason).toBe('not_indexed');
    expect(candidates).toEqual([]);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
    await app.close();
  });

  it('narrows the sample to a path prefix', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionFileSelection: SELECTION,
        ConventionExtraction: EXTRACTION,
      },
    });
    const app = await makeApp({ llm });
    await runScan(app, { path_prefix: 'src/api/' });

    const { state } = await listConventions(app);
    const selection = llm.calls.filter((c) => c.method === 'completeStructured')[0]!;
    const prompt = (selection.req as { messages: { content: string }[] }).messages[0]!.content;

    expect(state.sampled_files).toBe(1);
    expect(state.path_prefix).toBe('src/api/');
    expect(prompt).not.toContain('src/lib/redis.ts');
    await app.close();
  });

  // ---- failure containment -------------------------------------------------

  it('marks the repo as scanning before it answers, so the poll is never stale', async () => {
    const app = await makeApp();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/scan`,
      payload: {},
    });
    expect(res.statusCode).toBe(202);

    const [row] = await pg.handle.db
      .select({ status: t.conventionScans.status })
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId));
    expect(row!.status).toBeDefined();

    await waitForScan(app);
    await app.close();
  });

  it('records a provider failure instead of leaving the scan running forever', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: {} });
    // A fixture that fails the schema makes completeStructured throw, standing in
    // for any provider error (404 on an unavailable model, timeout, rate limit).
    const app = await makeApp({ llm });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/scan`,
      payload: {},
    });
    expect(res.statusCode).toBe(202);

    const { state, candidates } = await waitForScan(app);
    expect(state.status).toBe('failed');
    expect(state.error).toBeTruthy();
    expect(candidates).toEqual([]);
    await app.close();
  });

  it('reaps a scan orphaned by a dead process at boot', async () => {
    await pg.handle.db
      .insert(t.conventionScans)
      .values({ repoId, workspaceId, status: 'running' })
      .onConflictDoUpdate({
        target: t.conventionScans.repoId,
        set: { status: 'running', finishedAt: null, error: null },
      });

    const app = await makeApp();
    await app.ready();

    const { state } = await listConventions(app);
    expect(state.status).toBe('failed');
    expect(state.error).toContain('Scan aborted');
    await app.close();
  });

  // ---- triage --------------------------------------------------------------

  it('accepts, rejects, bulk-deselects and edits a candidate', async () => {
    const app = await makeApp();
    await runScan(app);
    const { candidates } = await listConventions(app);
    const [first, second] = candidates;

    const accepted = await app.inject({
      method: 'POST',
      url: `/conventions/${first.id}/accept`,
    });
    expect(accepted.json().convention.status).toBe('accepted');

    const rejected = await app.inject({ method: 'POST', url: `/conventions/${second.id}/reject` });
    expect(rejected.json().convention.status).toBe('rejected');

    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${first.id}`,
      payload: { rule: 'Prefer async/await over promise chains everywhere.' },
    });
    expect(edited.json().convention).toMatchObject({
      rule: 'Prefer async/await over promise chains everywhere.',
      status: 'accepted',
    });

    const deselected = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/status`,
      payload: { ids: [first.id], status: 'pending' },
    });
    expect(deselected.json().conventions[0].status).toBe('pending');
    await app.close();
  });

  it('404s a convention from another workspace', async () => {
    const app = await makeApp();
    await runScan(app);
    const { candidates } = await listConventions(app);

    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Date.now()}` })
      .returning();
    await pg.handle.db
      .update(t.conventions)
      .set({ workspaceId: other!.id })
      .where(eq(t.conventions.id, candidates[0].id));

    const res = await app.inject({ method: 'POST', url: `/conventions/${candidates[0].id}/accept` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects a rule edit that is too short', async () => {
    const app = await makeApp();
    await runScan(app);
    const { candidates } = await listConventions(app);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidates[0].id}`,
      payload: { rule: 'nope' },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  // ---- re-scan -------------------------------------------------------------

  it('preserves triage across a re-scan', async () => {
    const app = await makeApp();
    await runScan(app);
    const { candidates } = await listConventions(app);
    await app.inject({ method: 'POST', url: `/conventions/${candidates[0].id}/accept` });
    await app.inject({ method: 'POST', url: `/conventions/${candidates[1].id}/reject` });

    await runScan(app);

    const after = await listConventions(app);
    const byRule = Object.fromEntries(
      after.candidates.map((c: { rule: string; status: string }) => [c.rule, c.status]),
    );
    expect(byRule[candidates[0].rule]).toBe('accepted');
    expect(byRule[candidates[1].rule]).toBe('rejected');
    await app.close();
  });

  // ---- merge to skill ------------------------------------------------------

  it('404s the draft while nothing is accepted', async () => {
    const app = await makeApp();
    await runScan(app);

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('builds a draft from the accepted rows', async () => {
    const app = await makeApp();
    await runScan(app);
    const { candidates } = await listConventions(app);
    await app.inject({ method: 'POST', url: `/conventions/${candidates[0].id}/accept` });
    await app.inject({ method: 'POST', url: `/conventions/${candidates[1].id}/accept` });

    const draft = (
      await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })
    ).json();

    expect(draft).toMatchObject({
      slug: 'payments-api-conventions',
      name: 'payments-api-conventions',
      description: '2 house conventions extracted from payments-api',
      type: 'convention',
      merged_count: 2,
      existing_skill: null,
    });
    expect(draft.body).toContain('# payments-api-conventions');
    expect(draft.body).toContain('Detected in `src/api/users.ts:4`:');
    expect(draft.evidence_files).toEqual(['src/api/users.ts', 'src/lib/redis.ts']);
    await app.close();
  });

  it('creates a disabled extracted skill with evidence, ignoring any enabled the client asks for', async () => {
    const app = await makeApp();
    await runScan(app);
    const { candidates } = await listConventions(app);
    await app.inject({ method: 'POST', url: `/conventions/${candidates[0].id}/accept` });

    const draft = (
      await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
        enabled: true,
        source: 'manual',
      },
    });

    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      source: 'extracted',
      type: 'convention',
      enabled: false,
      version: 1,
    });
    expect(skill.evidence_files).toEqual(['src/api/users.ts']);

    const [snapshot] = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skill.id), eq(t.skillVersions.version, 1)));
    expect(snapshot).toBeDefined();

    const [linked] = await pg.handle.db
      .select({ skillId: t.conventions.skillId })
      .from(t.conventions)
      .where(eq(t.conventions.id, candidates[0].id));
    expect(linked!.skillId).toBe(skill.id);
    await app.close();
  });

  it('reports the existing skill on a second merge and updates it to v2', async () => {
    const app = await makeApp();
    await runScan(app);
    const { candidates } = await listConventions(app);
    await app.inject({ method: 'POST', url: `/conventions/${candidates[0].id}/accept` });

    const first = (
      await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        name: first.name,
        description: first.description,
        type: first.type,
        body: first.body,
      },
    });

    await app.inject({ method: 'POST', url: `/conventions/${candidates[1].id}/accept` });
    const second = (
      await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })
    ).json();

    expect(second.existing_skill).toMatchObject({ name: 'payments-api-conventions', version: 1 });
    expect(second.body_patch).toContain('Redis access goes through');

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        name: second.name,
        description: second.description,
        type: second.type,
        body: second.body,
        skill_id: second.existing_skill.id,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: second.existing_skill.id, version: 2, enabled: false });
    await app.close();
  });
});
