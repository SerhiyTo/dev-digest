import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * The skills module end-to-end over a real Postgres: CRUD, workspace scoping,
 * the creation gate on imported skills, body-only versioning, append-only
 * restore, the used_by fan-out and the delete cascade.
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Test Quality',
    description: 'Flags uncovered branches',
    type: 'rubric' as const,
    body: 'Flag any new branch without a test.\n',
  };

  const ghost = '00000000-0000-0000-0000-000000000000';

  async function createSkill(
    app: Awaited<ReturnType<typeof makeApp>>,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ---- CRUD + scoping -----------------------------------------------------

  it('round-trips create → read → update → delete', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { name: 'CRUD Skill' });
    expect(created).toMatchObject({
      name: 'CRUD Skill',
      description: 'Flags uncovered branches',
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const read = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().body).toBe(createBody.body);

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { description: 'Now with feeling', enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ description: 'Now with feeling', enabled: false });

    const removed = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ ok: true });
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${created.id}` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('404s for an unknown skill on every :id route', async () => {
    const app = await makeApp();
    for (const url of [`/skills/${ghost}`, `/skills/${ghost}/versions`]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions/1/diff` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/skills/${ghost}/versions/1/restore` }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${ghost}` })).statusCode).toBe(404);
    await app.close();
  });

  it('is workspace-scoped: a skill in another workspace is a 404', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Skill',
      type: 'custom',
      source: 'manual',
      body: 'not yours\n',
      enabled: true,
    });

    expect((await app.inject({ method: 'GET', url: `/skills/${foreign.id}` })).statusCode).toBe(
      404,
    );
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${foreign.id}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${foreign.id}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/skills/${foreign.id}` })).statusCode,
    ).toBe(404);

    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(listed.map((s: { id: string }) => s.id)).not.toContain(foreign.id);
    await app.close();
  });

  it('rejects a non-numeric :version at the edge (422, not 404)', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Param Guard' });
    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/abc/diff` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  // ---- Rule 1: the creation gate ------------------------------------------

  it('forces enabled=false for an imported skill even when the request asks for true', async () => {
    const app = await makeApp();
    const imported = await createSkill(app, {
      name: 'Imported Gate',
      source: 'imported_file',
      enabled: true,
    });
    expect(imported).toMatchObject({ source: 'imported_file', enabled: false });

    const read = (await app.inject({ method: 'GET', url: `/skills/${imported.id}` })).json();
    expect(read.enabled).toBe(false);
    await app.close();
  });

  it('applies the gate to every non-manual source', async () => {
    const app = await makeApp();
    for (const source of ['imported_url', 'extracted', 'community'] as const) {
      const skill = await createSkill(app, { name: `Gate ${source}`, source, enabled: true });
      expect(skill.enabled).toBe(false);
    }
    await app.close();
  });

  it('leaves an explicitly manual skill (and one with no source) enabled', async () => {
    const app = await makeApp();
    const explicit = await createSkill(app, {
      name: 'Manual Explicit',
      source: 'manual',
      enabled: true,
    });
    expect(explicit).toMatchObject({ source: 'manual', enabled: true });

    const implicit = await createSkill(app, { name: 'Manual Implicit' });
    expect(implicit).toMatchObject({ source: 'manual', enabled: true });

    const optedOut = await createSkill(app, { name: 'Manual Disabled', enabled: false });
    expect(optedOut.enabled).toBe(false);
    await app.close();
  });

  it('a vetted human can enable an imported skill afterwards', async () => {
    const app = await makeApp();
    const imported = await createSkill(app, {
      name: 'Vetted Later',
      source: 'imported_file',
      enabled: true,
    });
    const vetted = await app.inject({
      method: 'PUT',
      url: `/skills/${imported.id}`,
      payload: { enabled: true },
    });
    expect(vetted.json()).toMatchObject({ enabled: true, version: 1 });
    await app.close();
  });

  // ---- Rule 2: versioning is a body-only concern ---------------------------

  it('a new skill has exactly one version (v1) holding its body', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Fresh Version' });

    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      skill_id: skill.id,
      version: 1,
      body: createBody.body,
      label: null,
    });
    expect(typeof versions[0].created_at).toBe('string');
    await app.close();
  });

  it('changing the body bumps the version and snapshots it with the label', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Body Bump' });

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'Flag any new branch AND any new error path.\n', version_label: 'v2 rules' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      version: 2,
      body: 'Flag any new branch AND any new error path.\n',
      label: 'v2 rules',
    });
    expect(versions[1].label).toBeNull();
    await app.close();
  });

  it('a body change without a label snapshots a null label', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Unlabelled Bump' });
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'different\n' },
    });
    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions[0]).toMatchObject({ version: 2, label: null });
    await app.close();
  });

  it('changing only the name does NOT bump the version and writes no snapshot', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Metadata Only' });

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { name: 'Renamed', description: 'new words', type: 'convention', enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Renamed', type: 'convention', version: 1 });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    await app.close();
  });

  // ---- Degenerate PUT payloads (never a 500) -------------------------------

  it('an empty PUT is a no-op returning the skill unchanged', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Empty Patch' });

    const res = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(skill);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('a label-only PUT is rejected as 422, not silently dropped', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Label Only' });

    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { version_label: 'just a label' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');

    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json()).toEqual(skill);
    await app.close();
  });

  it('a label alongside a change that writes no snapshot is also 422', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Label With Rename' });

    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { name: 'Renamed Anyway', version_label: 'nowhere to put this' },
    });
    expect(renamed.statusCode).toBe(422);

    const unchangedBody = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: createBody.body, version_label: 'nowhere to put this either' },
    });
    expect(unchangedBody.statusCode).toBe(422);

    // Neither request wrote anything.
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json()).toEqual(skill);
    await app.close();
  });

  it('a label with a real body change is accepted', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Label With Body' });
    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'genuinely different\n', version_label: 'tightened wording' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(2);
    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions[0].label).toBe('tightened wording');
    await app.close();
  });

  it('an empty PUT against an unknown skill is still a 404', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'PUT', url: `/skills/${ghost}`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('resubmitting the identical body is not a change', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Idempotent Body' });
    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: createBody.body },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(1);
    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  // ---- Diff ---------------------------------------------------------------

  it('diffs a past version against the current body', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Diffable', body: 'one\ntwo\n' });
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'one\ntwo\nthree\n' },
    });

    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/1/diff` });
    expect(res.statusCode).toBe(200);
    const { patch } = res.json();
    expect(patch.split('\n')[0]).toMatch(/^@@ /);
    expect(patch).toContain('+three');
    expect(patch).not.toContain('---');
    expect(patch).not.toContain('+++');

    expect(
      (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/99/diff` }))
        .statusCode,
    ).toBe(404);
    await app.close();
  });

  it('diffing the current version against itself yields an empty patch', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Self Diff', body: 'unchanged\n' });
    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/1/diff` });
    expect(res.statusCode).toBe(200);
    expect(res.json().patch).toBe('');
    await app.close();
  });

  // ---- Rule 3: restore appends, never rewrites -----------------------------

  it('restore creates a new version with the old body and auto-labels it', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Restorable', body: 'v1 body\n' });
    for (const body of ['v2 body\n', 'v3 body\n', 'v4 body\n', 'v5 body\n']) {
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body } });
    }
    const before = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(before.map((v: { version: number }) => v.version)).toEqual([5, 4, 3, 2, 1]);

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/3/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 6, body: 'v3 body\n' });

    const after = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(after.map((v: { version: number }) => v.version)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(after[0]).toMatchObject({ version: 6, body: 'v3 body\n', label: 'Restored from v3' });

    // Every pre-existing version is byte-identical to what it was.
    expect(after.slice(1)).toEqual(before);
    await app.close();
  });

  it('restoring the version that already matches the current body still appends', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Restore Noop', body: 'same\n' });
    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/1/restore`,
    });
    expect(restored.json()).toMatchObject({ version: 2, body: 'same\n' });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].label).toBe('Restored from v1');
    await app.close();
  });

  it('restoring a version that never existed is a 404 and changes nothing', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Restore 404' });
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/42/restore`,
    });
    expect(res.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().version).toBe(
      1,
    );
    await app.close();
  });

  // ---- used_by + cascade ---------------------------------------------------

  it('GET /skills reports used_by from agent_skills without double-counting', async () => {
    const app = await makeApp();
    const linked = await createSkill(app, { name: 'Linked Twice' });
    const orphan = await createSkill(app, { name: 'Orphan Skill' });

    const agentIds: string[] = [];
    for (const name of ['Reviewer A', 'Reviewer B']) {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name,
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      });
      agentIds.push(res.json().id);
    }
    for (const agentId of agentIds) {
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [linked.id] },
      });
      expect(res.statusCode).toBe(200);
    }
    // Re-linking the same pair must not inflate the count.
    await app.inject({
      method: 'POST',
      url: `/agents/${agentIds[0]}/skills`,
      payload: { skill_ids: [linked.id] },
    });

    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const byId = new Map(listed.map((s: { id: string }) => [s.id, s]));
    expect((byId.get(linked.id) as { used_by: number }).used_by).toBe(2);
    expect((byId.get(orphan.id) as { used_by: number }).used_by).toBe(0);
    await app.close();
  });

  it('DELETE cascades the agent_skills links away', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'Cascade Skill' });
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Cascade Agent',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json().id as string;
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const { db } = pg.handle;
    const linksBefore = await db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skill.id)));
    expect(linksBefore).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(
      200,
    );

    const linksAfter = await db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skill.id));
    expect(linksAfter).toHaveLength(0);
    const versionsAfter = await db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versionsAfter).toHaveLength(0);
    await app.close();
  });
});
