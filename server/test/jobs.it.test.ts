import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { JobRunner } from '../src/platform/jobs.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[jobs] Docker not available — skipping integration tests.');
}

/**
 * JobRunner's failure contract. `enqueue` records a failed job and rethrows into
 * the `done` promise, which no module awaits — so an unobserved rejection there
 * used to terminate the API process under Node's default policy.
 */
d('JobRunner failure handling', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('records a failing job without crashing on the ignored done promise', async () => {
    const jobs = new JobRunner(pg.handle.db, { retries: 0 });
    jobs.register('test-boom', async () => {
      throw new Error('Operation timed out after 120000ms');
    });

    // Deliberately does NOT touch `job.done` — this is how every module enqueues.
    const job = await jobs.enqueue(workspaceId, 'test-boom', {});
    await jobs.onIdle();
    await new Promise((r) => setTimeout(r, 50));

    const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, job.id));
    expect(row!.status).toBe('failed');
    expect(row!.error).toContain('timed out');
  });

  it('still surfaces the error to a caller that awaits done', async () => {
    const jobs = new JobRunner(pg.handle.db, { retries: 0 });
    jobs.register('test-boom-awaited', async () => {
      throw new Error('handler exploded');
    });

    const job = await jobs.enqueue(workspaceId, 'test-boom-awaited', {});

    await expect(job.done).rejects.toThrow('handler exploded');
  });

  it('resolves done for a job that succeeds', async () => {
    const jobs = new JobRunner(pg.handle.db, { retries: 0 });
    jobs.register('test-ok', async () => {});

    const job = await jobs.enqueue(workspaceId, 'test-ok', {});
    await expect(job.done).resolves.toBeUndefined();

    const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, job.id));
    expect(row!.status).toBe('done');
  });
});
