import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { CloneDocsSource, RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockCloneDocs } from '../src/adapters/mocks.js';
import { ContextRepository } from '../src/modules/context/repository.js';
import { ContextService } from '../src/modules/context/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

const ARCHITECTURE = 'docs/architecture.md';
const TESTING = 'docs/guides/testing.md';
const ROADMAP = 'plans/roadmap.mdx';
const SPEC = 'specs/2026-08-20-project-context.md';

const DOCS: Record<string, string> = {
  [ARCHITECTURE]: '# Architecture\n\nThe API is a modular monolith behind one Fastify app.',
  [TESTING]: '# Testing\n\nThe integration lane runs against a real Postgres.',
  [ROADMAP]: '# Roadmap\n\nL05 ships the project-context folder.',
  [SPEC]: '# Project context\n\nAttach a repository document to a reviewer agent.',
  'README.md': 'not under a documentation root',
  'src/index.ts': 'export {};',
};

const DOC_PATHS = [ARCHITECTURE, TESTING, ROADMAP, SPEC];

const CLONE_PATH = '/clones/acme/payments-api';

const REPO_REF: RepoRef & { clonePath: string } = {
  owner: 'acme',
  name: 'payments-api',
  clonePath: CLONE_PATH,
};

/**
 * Project Context end to end over a real Postgres: discovery through the
 * injected clone source, the not-cloned and unreadable states, attachment
 * persistence for agents and skills, the path and attachment limits, and the
 * token estimate.
 *
 * `MockCloneDocs.list()` ignores its `repo` argument, so nothing here asserts
 * per-repository isolation — that property is not observable against the mock.
 */
d('project context module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let agentId: string;
  let skilledAgentId: string;
  let skillId: string;
  let secondSkillId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  function makeApp(cloneDocs: CloneDocsSource) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({ config, db: pg.handle.db, overrides: { cloneDocs } });
  }

  async function setClone(clonePath: string | null) {
    await pg.handle.db.update(t.repos).set({ clonePath }).where(eq(t.repos.id, repoId));
  }

  async function skillNamed(name: string) {
    const [row] = await pg.handle.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row!.id;
  }

  async function setSkillEnabled(id: string, enabled: boolean) {
    await pg.handle.db.update(t.skills).set({ enabled }).where(eq(t.skills.id, id));
  }

  function usedByAgents(
    body: { documents: { path: string; used_by_agents: string[] }[] },
    path: string,
  ) {
    return body.documents.find((doc) => doc.path === path)!.used_by_agents;
  }

  function contextService() {
    return new ContextService({
      store: new ContextRepository(pg.handle.db),
      docs: new MockCloneDocs(DOCS),
      tokens: { count: (text) => text.length },
    });
  }

  async function agentNamed(name: string) {
    const [row] = await pg.handle.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, name)));
    return row!.id;
  }

  function list() {
    return app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
  }

  function attach(kind: 'agents' | 'skills', ownerId: string, paths: string[]) {
    return app.inject({ method: 'PUT', url: `/${kind}/${ownerId}/context`, payload: { paths } });
  }

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));

    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    repoId = repo!.id;

    agentId = await agentNamed('General Reviewer');
    skilledAgentId = await agentNamed('Test Quality Reviewer');

    skillId = await skillNamed('test-coverage-rubric');
    secondSkillId = await skillNamed('flaky-test-signals');

    app = await makeApp(new MockCloneDocs(DOCS));
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.agentDocs);
    await pg.handle.db.delete(t.skillDocs);
    await setSkillEnabled(skillId, true);
    await setSkillEnabled(secondSkillId, true);
    await setClone(CLONE_PATH);
  });

  // ---- discovery -----------------------------------------------------------

  it('names the missing clone instead of returning a bare empty list (AC-7)', async () => {
    await setClone(null);

    const res = await list();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      documents: [],
      omitted: 0,
      reason: 'not_cloned',
      last_synced_at: null,
    });
  });

  it('lists markdown under the four roots only, with its category (AC-1, AC-3)', async () => {
    const body = (await list()).json();

    expect(body.documents.map((doc: { path: string }) => doc.path)).toEqual(DOC_PATHS);
    expect(body.documents[1]).toMatchObject({
      path: TESTING,
      name: 'testing.md',
      folder: 'docs/guides',
      category: 'docs',
      used_by_agents: [],
    });
    expect(body.documents[2]).toMatchObject({ category: 'plans', folder: 'plans' });
    expect(body.documents[3]).toMatchObject({ category: 'specs' });
    expect(body.omitted).toBe(0);
    expect(body.reason).toBeNull();
  });

  it('re-walks the clone on resync and reports the refresh time (AC-10)', async () => {
    const before = (await list()).json();
    await new Promise((r) => setTimeout(r, 5));

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/context/resync` });
    expect(res.statusCode).toBe(200);

    const after = res.json();
    expect(after.documents.map((doc: { path: string }) => doc.path)).toEqual(DOC_PATHS);
    expect(Date.parse(after.last_synced_at)).toBeGreaterThan(Date.parse(before.last_synced_at));
  });

  it('distinguishes an unreadable document from a missing one (AC-9)', async () => {
    const broken: CloneDocsSource = {
      list: async () => [{ path: ARCHITECTURE }, { path: 'docs/broken.md' }],
      read: async (_cloneRoot, path) => {
        if (path === ARCHITECTURE) return { ok: true, text: '# ok' };
        if (path === 'docs/broken.md') return { ok: false, reason: 'unreadable' };
        return { ok: false, reason: 'missing' };
      },
    };
    const other = await makeApp(broken);

    const ok = await other.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=${ARCHITECTURE}`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ path: ARCHITECTURE, content: '# ok', truncated: false });

    const unreadable = await other.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=docs/broken.md`,
    });
    expect(unreadable.statusCode).toBe(404);
    expect(unreadable.json().error.code).toBe('document_unreadable');

    const missing = await other.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=docs/absent.md`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');

    await other.close();
  });

  it('counts an agent once whether it attaches directly or through a skill (AC-11)', async () => {
    expect((await attach('agents', skilledAgentId, [ARCHITECTURE])).statusCode).toBe(200);
    expect((await attach('skills', skillId, [ARCHITECTURE])).statusCode).toBe(200);

    const body = (await list()).json();
    const doc = body.documents.find((d: { path: string }) => d.path === ARCHITECTURE);
    expect(doc.used_by_agents).toEqual(['Test Quality Reviewer']);

    const untouched = body.documents.find((d: { path: string }) => d.path === SPEC);
    expect(untouched.used_by_agents).toEqual([]);
  });

  it('drops an agent that reaches a document only through a disabled skill (AC-11)', async () => {
    expect((await attach('skills', skillId, [ARCHITECTURE])).statusCode).toBe(200);
    expect((await attach('skills', secondSkillId, [SPEC])).statusCode).toBe(200);

    const whileEnabled = (await list()).json();
    expect(usedByAgents(whileEnabled, ARCHITECTURE)).toEqual(['Test Quality Reviewer']);
    expect(usedByAgents(whileEnabled, SPEC)).toEqual(['Test Quality Reviewer']);

    await setSkillEnabled(secondSkillId, false);

    const whileDisabled = (await list()).json();
    expect(usedByAgents(whileDisabled, SPEC)).toEqual([]);
    expect(usedByAgents(whileDisabled, ARCHITECTURE)).toEqual(['Test Quality Reviewer']);
  });

  // ---- attachments ---------------------------------------------------------

  it('persists agent attachments and returns them in ascending order (AC-13)', async () => {
    const put = await attach('agents', agentId, [SPEC, ARCHITECTURE]);
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual([
      { path: SPEC, order: 0 },
      { path: ARCHITECTURE, order: 1 },
    ]);

    const get = await app.inject({ method: 'GET', url: `/agents/${agentId}/context` });
    expect(get.json()).toEqual(put.json());

    const detached = await attach('agents', agentId, [ARCHITECTURE]);
    expect(detached.json()).toEqual([{ path: ARCHITECTURE, order: 0 }]);
  });

  it('persists a new order on reorder (AC-14)', async () => {
    await attach('agents', agentId, [SPEC, ARCHITECTURE, ROADMAP]);
    const reordered = await attach('agents', agentId, [ROADMAP, SPEC, ARCHITECTURE]);

    expect(reordered.json()).toEqual([
      { path: ROADMAP, order: 0 },
      { path: SPEC, order: 1 },
      { path: ARCHITECTURE, order: 2 },
    ]);

    const rows = await pg.handle.db
      .select({ path: t.agentDocs.path, order: t.agentDocs.order })
      .from(t.agentDocs)
      .where(eq(t.agentDocs.agentId, agentId));
    expect(rows.find((r) => r.path === ROADMAP)!.order).toBe(0);
    expect(rows.find((r) => r.path === ARCHITECTURE)!.order).toBe(2);
  });

  it('persists skill attachments with their own order index (AC-19)', async () => {
    const put = await attach('skills', skillId, [ROADMAP, TESTING]);
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual([
      { path: ROADMAP, order: 0 },
      { path: TESTING, order: 1 },
    ]);

    const get = await app.inject({ method: 'GET', url: `/skills/${skillId}/context` });
    expect(get.json()).toEqual(put.json());
  });

  it('rejects a path outside the documentation roots with 400, creating no row (AC-15)', async () => {
    await attach('agents', agentId, [ARCHITECTURE]);

    const res = await attach('agents', agentId, [ARCHITECTURE, '../../etc/passwd']);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_path');

    const rows = await pg.handle.db
      .select({ path: t.agentDocs.path })
      .from(t.agentDocs)
      .where(eq(t.agentDocs.agentId, agentId));
    expect(rows.map((r) => r.path)).toEqual([ARCHITECTURE]);

    const preview = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=${encodeURIComponent('../../etc/passwd')}`,
    });
    expect(preview.statusCode).toBe(400);
    expect(preview.json().error.code).toBe('invalid_path');
  });

  it('refuses the twenty-first attachment with 409 naming the limit (AC-16)', async () => {
    const paths = Array.from({ length: 21 }, (_, i) => `docs/f${i}.md`);

    const res = await attach('agents', agentId, paths);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('conflict');
    expect(res.json().error.message).toContain('20');

    const rows = await pg.handle.db
      .select({ path: t.agentDocs.path })
      .from(t.agentDocs)
      .where(eq(t.agentDocs.agentId, agentId));
    expect(rows).toHaveLength(0);

    expect((await attach('agents', agentId, paths.slice(0, 20))).statusCode).toBe(200);
  });

  // ---- token estimate ------------------------------------------------------

  it('prices the assembled block and names the estimator (AC-22, AC-23)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context/estimate`,
      payload: { paths: [ARCHITECTURE, SPEC] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estimator).toBe('cl100k_base');
    expect(res.json().tokens).toBeGreaterThan(0);

    const one = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context/estimate`,
      payload: { paths: [ARCHITECTURE] },
    });
    expect(one.json().tokens).toBeLessThan(res.json().tokens);

    const none = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context/estimate`,
      payload: { paths: [] },
    });
    expect(none.json().tokens).toBe(0);
  });

  it('recomputes the estimate for twenty documents inside 300 ms (AC-25)', async () => {
    const bulk: Record<string, string> = {};
    const paths = Array.from({ length: 20 }, (_, i) => `docs/bulk-${i}.md`);
    for (const path of paths) bulk[path] = `# ${path}\n\n${'lorem ipsum dolor sit amet. '.repeat(80)}`;

    const other = await makeApp(new MockCloneDocs(bulk));
    const call = () =>
      other.inject({
        method: 'POST',
        url: `/repos/${repoId}/context/estimate`,
        payload: { paths },
      });

    const warm = await call();
    expect(warm.statusCode).toBe(200);
    expect(warm.json().tokens).toBeGreaterThan(0);

    const started = Date.now();
    const res = await call();
    const elapsed = Date.now() - started;

    expect(res.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(300);

    await other.close();
  });

  // ---- the run-time resolver T9 calls --------------------------------------

  it('resolves a run in merge order — agent first, then linked skills (AC-27)', async () => {
    await attach('agents', skilledAgentId, [SPEC]);
    await attach('skills', skillId, [ARCHITECTURE, SPEC, 'docs/gone.md']);

    const service = new ContextService({
      store: new ContextRepository(pg.handle.db),
      docs: new MockCloneDocs(DOCS),
      tokens: { count: (text) => text.length },
    });

    const resolved = await service.resolveForRun(skilledAgentId, REPO_REF);

    expect(resolved.specsRead).toEqual([SPEC, ARCHITECTURE]);
    expect(resolved.specs[0]!.startsWith(`${SPEC}\n\n`)).toBe(true);
    expect(resolved.specs[0]).toContain('Attach a repository document');
    expect(resolved.skipped).toEqual([{ path: 'docs/gone.md', reason: 'unreadable' }]);
  });

  it('injects nothing from a disabled skill, matching the run event that reports it skipped', async () => {
    await attach('skills', skillId, [ARCHITECTURE]);
    await attach('skills', secondSkillId, [SPEC]);
    const service = contextService();

    const whileEnabled = await service.resolveForRun(skilledAgentId, REPO_REF);
    expect(whileEnabled.specsRead).toEqual([ARCHITECTURE, SPEC]);

    await setSkillEnabled(secondSkillId, false);

    const whileDisabled = await service.resolveForRun(skilledAgentId, REPO_REF);
    expect(whileDisabled.specsRead).toEqual([ARCHITECTURE]);
    expect(whileDisabled.specs).toHaveLength(1);
    expect(whileDisabled.specs.join('\n')).not.toContain('Attach a repository document');
  });

  it('resolves an agent with nothing attached to an empty block (AC-31)', async () => {
    const service = new ContextService({
      store: new ContextRepository(pg.handle.db),
      docs: new MockCloneDocs(DOCS),
      tokens: { count: (text) => text.length },
    });

    expect(await service.resolveForRun(agentId, REPO_REF)).toEqual({
      specs: [],
      specsRead: [],
      skipped: [],
    });
  });
});
