import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { CloneDocsSource, Review, RunTrace } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockCloneDocs } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const ARCHITECTURE = 'docs/architecture.md';
const SPEC = 'specs/2026-08-20-project-context.md';
const ROADMAP = 'plans/roadmap.mdx';
const ATTACHED_BUT_UNREADABLE = 'docs/never-written.md';

const ONLY_IN_THE_DEFAULT_BRANCH_CLONE = 'READ-FROM-THE-DEFAULT-BRANCH-CLONE';
const ONLY_ON_THE_PULL_REQUEST_HEAD = 'REWRITTEN-ON-THE-PULL-REQUEST-HEAD';
const ONLY_UNDER_THE_STORED_CLONE_PATH = 'READ-FROM-THE-STORED-CLONE-PATH';
const ONLY_UNDER_THE_DERIVED_CLONE_PATH = 'READ-FROM-THE-DERIVED-CLONE-PATH';

const MOVED_REPO = { owner: 'acme', name: 'context-moved' };
const STORED_CLONE_PATH = '/relocated/by/the/operator/context-moved';

const BUDGET_DOCS = [1, 2, 3, 4, 5].map((n) => `docs/budget-${n}.md`);
const OVERFLOWS_THE_BLOCK_BUDGET = BUDGET_DOCS[4]!;
const budgetMarker = (n: number) => `BUDGET-DOCUMENT-${n}-BODY`;
const budgetBody = (n: number) =>
  `# Budget ${n}\n\n${budgetMarker(n)}\n\n${'the block budget is 120,000 characters. '.repeat(1_000)}`;

function docsPerCloneRoot(byRoot: Record<string, Record<string, string>>): CloneDocsSource {
  return {
    async list(cloneRoot) {
      return Object.keys(byRoot[cloneRoot] ?? {})
        .sort()
        .map((path) => ({ path }));
    },
    async read(cloneRoot, path) {
      const text = byRoot[cloneRoot]?.[path];
      return text === undefined ? { ok: false, reason: 'missing' } : { ok: true, text };
    },
  };
}

const DEFAULT_BRANCH_CLONE_DOCS: Record<string, string> = {
  [ARCHITECTURE]: `# Architecture\n\n${ONLY_IN_THE_DEFAULT_BRANCH_CLONE}: one Fastify app behind one process.`,
  [SPEC]: '# Project context\n\nAttach a repository document to a reviewer agent.',
  [ROADMAP]: '# Roadmap\n\nL05 ships the project-context folder.',
  ...Object.fromEntries(BUDGET_DOCS.map((path, i) => [path, budgetBody(i + 1)])),
};

const PULL_REQUEST_REWRITES_THE_ATTACHED_DOCUMENT = `diff --git a/docs/architecture.md b/docs/architecture.md
--- a/docs/architecture.md
+++ b/docs/architecture.md
@@ -1,3 +1,4 @@
 # Architecture
+${ONLY_ON_THE_PULL_REQUEST_HEAD}: rewritten by this pull request.
 One Fastify app behind one process.`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Documentation only.',
  score: 90,
  findings: [],
};

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('project context at run time', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let prId: string;
  let prNumber: number;
  let terminalRunsExpected = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));

    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: PULL_REQUEST_REWRITES_THE_ATTACHED_DOCUMENT }),
        cloneDocs: new MockCloneDocs(DEFAULT_BRANCH_CLONE_DOCS),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'context-runtime',
        fullName: 'acme/context-runtime',
        clonePath: '/mock/clones/acme/context-runtime',
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 901,
        title: 'Rewrite the architecture note',
        author: 'marisa.koch',
        branch: 'docs/arch',
        base: 'main',
        headSha: 'c0ffee01',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: ARCHITECTURE,
      additions: 1,
      deletions: 0,
      patch: `@@ -1,3 +1,4 @@\n # Architecture\n+${ONLY_ON_THE_PULL_REQUEST_HEAD}: rewritten by this pull request.\n One Fastify app behind one process.`,
    });
    prId = pr!.id;
    prNumber = pr!.number;
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function createAgent(name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name,
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'You review documentation changes.',
        },
      })
    ).json();
  }

  async function runAgentAndPinItToADoneRunWithARealPrompt(agentId: string): Promise<RunTrace> {
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;

    terminalRunsExpected += 1;
    await waitForPrRuns(pg.handle.db, prId, { expected: terminalRunsExpected });
    await waitForRunTrace(pg.handle.db, runId);

    const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(row!.status).toBe('done');

    const trace = (
      await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })
    ).json() as RunTrace;
    expect(trace.prompt_assembly.user).toContain('## Diff to review');
    expect(trace.prompt_assembly.user).toContain(`Review pull request #${prNumber}`);
    return trace;
  }

  function attach(kind: 'agents' | 'skills', ownerId: string, paths: string[]) {
    return app.inject({ method: 'PUT', url: `/${kind}/${ownerId}/context`, payload: { paths } });
  }

  it('injects agent- then skill-attached documents once each, from the default-branch clone rather than the pull request head, and reports them in specs_read', async () => {
    const agent = await createAgent('Context Reviewer');
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'context-runtime-rubric',
          description: 'Checks documentation.',
          type: 'rubric',
          body: '# Rubric\nCheck the docs.',
          source: 'manual',
        },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/agents/${agent.id}/skills`,
          payload: { skill_ids: [skill.id] },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (await attach('agents', agent.id, [SPEC, ATTACHED_BUT_UNREADABLE, ARCHITECTURE])).statusCode,
    ).toBe(200);
    expect((await attach('skills', skill.id, [ARCHITECTURE, ROADMAP])).statusCode).toBe(200);

    const trace = await runAgentAndPinItToADoneRunWithARealPrompt(agent.id);

    expect(trace.specs_read).toEqual([SPEC, ARCHITECTURE, ROADMAP]);

    expect(trace.prompt_assembly.specs).not.toBeNull();
    const specs = trace.prompt_assembly.specs ?? '';
    const user = trace.prompt_assembly.user;

    expect(specs).toContain(`${SPEC}\n\n# Project context`);
    expect(specs).toContain(`${ARCHITECTURE}\n\n# Architecture`);
    expect(specs).toContain(`${ROADMAP}\n\n# Roadmap`);
    expect(specs).not.toContain(ATTACHED_BUT_UNREADABLE);

    expect(user.split('## Project context')).toHaveLength(2);
    expect(specs).toContain('<untrusted source="spec-0">');
    expect(specs).toContain('<untrusted source="spec-2">');

    expect(user).toContain(ONLY_ON_THE_PULL_REQUEST_HEAD);
    expect(specs).toContain(ONLY_IN_THE_DEFAULT_BRANCH_CLONE);
    expect(specs).not.toContain(ONLY_ON_THE_PULL_REQUEST_HEAD);

    const msgs = trace.log.map((l) => l.msg);
    expect(msgs).toContain('project context: 3 injected, 1 skipped');
    expect(msgs).toContain(`project context skipped: ${ATTACHED_BUT_UNREADABLE} (unreadable)`);
  });

  it('reads the clone root stored on the repo row, not the one the git adapter derives', async () => {
    const git = new MockGitClient({ diff: PULL_REQUEST_REWRITES_THE_ATTACHED_DOCUMENT });
    const derivedClonePath = git.clonePathFor(MOVED_REPO);
    expect(derivedClonePath).not.toBe(STORED_CLONE_PATH);

    const relocated = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git,
        cloneDocs: docsPerCloneRoot({
          [STORED_CLONE_PATH]: {
            [ARCHITECTURE]: `# Architecture\n\n${ONLY_UNDER_THE_STORED_CLONE_PATH}: one Fastify app.`,
          },
          [derivedClonePath]: {
            [ARCHITECTURE]: `# Architecture\n\n${ONLY_UNDER_THE_DERIVED_CLONE_PATH}: a stale copy.`,
          },
        }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });

    try {
      const [movedRepo] = await pg.handle.db
        .insert(t.repos)
        .values({
          workspaceId,
          owner: MOVED_REPO.owner,
          name: MOVED_REPO.name,
          fullName: `${MOVED_REPO.owner}/${MOVED_REPO.name}`,
          clonePath: STORED_CLONE_PATH,
        })
        .returning();
      const [movedPr] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: movedRepo!.id,
          number: 902,
          title: 'Rewrite the architecture note again',
          author: 'marisa.koch',
          branch: 'docs/arch-moved',
          base: 'main',
          headSha: 'c0ffee02',
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'needs_review',
        })
        .returning();
      await pg.handle.db.insert(t.prFiles).values({
        prId: movedPr!.id,
        path: ARCHITECTURE,
        additions: 1,
        deletions: 0,
        patch: `@@ -1,3 +1,4 @@\n # Architecture\n+${ONLY_ON_THE_PULL_REQUEST_HEAD}: rewritten by this pull request.\n One Fastify app behind one process.`,
      });

      const agent = (
        await relocated.inject({
          method: 'POST',
          url: '/agents',
          payload: {
            name: 'Relocated Clone Reviewer',
            provider: 'openai',
            model: 'gpt-4.1',
            system_prompt: 'You review documentation changes.',
          },
        })
      ).json();
      expect(
        (
          await relocated.inject({
            method: 'PUT',
            url: `/agents/${agent.id}/context`,
            payload: { paths: [ARCHITECTURE] },
          })
        ).statusCode,
      ).toBe(200);

      const started = await relocated.inject({
        method: 'POST',
        url: `/pulls/${movedPr!.id}/review`,
        payload: { agentId: agent.id },
      });
      expect(started.statusCode).toBe(200);
      const runId = started.json().runs[0].run_id as string;

      await waitForPrRuns(pg.handle.db, movedPr!.id, { expected: 1 });
      await waitForRunTrace(pg.handle.db, runId);
      const [row] = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.id, runId));
      expect(row!.status).toBe('done');

      const trace = (
        await relocated.inject({ method: 'GET', url: `/runs/${runId}/trace` })
      ).json() as RunTrace;

      expect(trace.specs_read).toEqual([ARCHITECTURE]);
      const specs = trace.prompt_assembly.specs ?? '';
      expect(specs).toContain(ONLY_UNDER_THE_STORED_CLONE_PATH);
      expect(specs).not.toContain(ONLY_UNDER_THE_DERIVED_CLONE_PATH);
      expect(trace.log.map((l) => l.msg)).toContain('project context: 1 injected, 0 skipped');
    } finally {
      await relocated.close();
    }
  });

  it('leaves the user message byte-identical when the agent has nothing attached', async () => {
    const agent = await createAgent('Bare Reviewer');

    const beforeAnythingWasAttached = await runAgentAndPinItToADoneRunWithARealPrompt(agent.id);
    expect(beforeAnythingWasAttached.prompt_assembly.specs).toBeNull();
    expect(beforeAnythingWasAttached.specs_read).toEqual([]);
    expect(beforeAnythingWasAttached.prompt_assembly.user).not.toContain('## Project context');

    expect((await attach('agents', agent.id, [SPEC])).statusCode).toBe(200);
    const withOneAttached = await runAgentAndPinItToADoneRunWithARealPrompt(agent.id);
    expect(withOneAttached.specs_read).toEqual([SPEC]);
    expect(withOneAttached.prompt_assembly.user).toContain('## Project context');

    expect((await attach('agents', agent.id, [])).statusCode).toBe(200);
    const afterEverythingWasDetached = await runAgentAndPinItToADoneRunWithARealPrompt(agent.id);

    expect(afterEverythingWasDetached.prompt_assembly.user).toBe(
      beforeAnythingWasAttached.prompt_assembly.user,
    );
    expect(afterEverythingWasDetached.prompt_assembly.specs).toBeNull();
    expect(afterEverythingWasDetached.specs_read).toEqual([]);
    expect(afterEverythingWasDetached.log.map((l) => l.msg)).toContain(
      'project context: 0 injected, 0 skipped',
    );
  });

  it('names every document omitted for the block budget, with its reason, in the persisted run log', async () => {
    const agent = await createAgent('Budget Reviewer');
    expect((await attach('agents', agent.id, BUDGET_DOCS)).statusCode).toBe(200);

    const trace = await runAgentAndPinItToADoneRunWithARealPrompt(agent.id);

    expect(trace.specs_read).toEqual(BUDGET_DOCS.slice(0, 4));
    expect(trace.specs_read).not.toContain(OVERFLOWS_THE_BLOCK_BUDGET);

    const specs = trace.prompt_assembly.specs ?? '';
    expect(specs).toContain(budgetMarker(1));
    expect(specs).toContain(budgetMarker(4));
    expect(specs).toContain('… (truncated)');
    expect(specs).not.toContain(budgetMarker(5));

    const msgs = trace.log.map((l) => l.msg);
    expect(msgs).toContain('project context: 4 injected, 1 skipped');
    expect(msgs).toContain(
      `project context skipped: ${OVERFLOWS_THE_BLOCK_BUDGET} (block_budget)`,
    );
  });
});
