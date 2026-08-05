# Examples: good and bad pairs from this codebase

Code here follows the repo rule of no inline comments — intent is carried by
names and types.

## Querying from a handler

```ts
❌ modules/pulls/routes.ts
import { and, desc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/repos/:id/pulls', async (req) => {
  const rows = await app.container.db
    .select().from(t.pulls)
    .where(and(eq(t.pulls.repoId, req.params.id), isNull(t.pulls.closedAt)))
    .orderBy(desc(t.pulls.number));
  return rows.map((r) => ({ id: r.id, number: r.number }));
});
```

```ts
✅
app.get('/repos/:id/pulls', { schema: { params: RepoIdParam } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listOpen(workspaceId, req.params.id);
});
```

`modules/repos/routes.ts` is 48 lines and does only this; `modules/pulls/routes.ts`
is 366 lines and does the first.

## Taking the container instead of ports

```ts
❌ export class ReviewService {
  private repo: ReviewRepository;
  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
  }
}
```

```ts
✅ export class ReviewService {
  constructor(
    private readonly runs: RunStore,
    private readonly llm: LLMProvider,
    private readonly clock: Clock,
  ) {}
}
```

The first cannot be constructed in a test without a whole `Container`, and its
repository cannot be substituted at all. All four services in `server/src/modules`
are currently the first shape — see `migration.md` §3.

## A rule buried in orchestration

```ts
❌ async reapStaleRuns() {
  const runs = await this.runs.findRunning();
  for (const run of runs) {
    const age = Date.now() - run.startedAt.getTime();
    if (age > 2 * 60 * 60 * 1000 && run.heartbeatAt === null) {
      await this.runs.markFailed(run.id, 'stale');
    }
  }
}
```

```ts
✅ domain.ts
export const isStale = (run: RunSnapshot, now: Date): boolean =>
  run.heartbeatAt === null && now.getTime() - run.startedAt.getTime() > STALE_AFTER_MS;

✅ service.ts
async reapStaleRuns() {
  const now = this.clock.now();
  const stale = (await this.runs.findRunning()).filter((r) => isStale(r, now));
  await Promise.all(stale.map((r) => this.runs.markFailed(r.id, 'stale')));
}
```

The threshold is now testable in microseconds and the magic number has a name.
`app.ts` calls `reapStaleRuns()` on boot, so this rule already has two callers.

## A port that mirrors the repository

```ts
❌ export interface ReviewStore {
  findById(id: string): Promise<ReviewRow | undefined>;
  findByPull(pullId: string): Promise<ReviewRow[]>;
  findByRepo(repoId: string): Promise<ReviewRow[]>;
  insert(v: InsertReview): Promise<ReviewRow>;
  update(id: string, v: Partial<InsertReview>): Promise<void>;
  remove(id: string): Promise<boolean>;
  countByRepo(repoId: string): Promise<number>;
}
```

```ts
✅ export interface ReviewStore {
  findByPull(pullId: string): Promise<ReviewSummary[]>;
  recordOutcome(id: string, outcome: ReviewOutcome): Promise<void>;
}
```

The port is what *this* use case needs, and it names domain types rather than
rows. A mirror-image port makes every fake a chore, which is how test suites
quietly stop being written.

## Leaking a row type inward

```ts
❌ domain.ts
import type { RepoRow } from './repository.js';
export const isIndexable = (repo: RepoRow): boolean => repo.clonePath !== null;
```

```ts
✅ domain.ts
export interface RepoSnapshot { cloned: boolean; archived: boolean }
export const isIndexable = (repo: RepoSnapshot): boolean =>
  repo.cloned && !repo.archived;
```

Ring 1 importing from `repository.ts` reverses the arrow, and it re-couples the
rule to whatever the migration did to that column last week.

## Re-parsing inside a handler

```ts
❌ app.post('/pulls/:id/review', async (req) => {
  const body = RunRequest.parse(req.body ?? {});
  return service.runReview(req.params.id, body);
});
```

```ts
✅ app.post('/pulls/:id/review', {
  schema: { params: PullIdParam, body: RunRequest },
}, async (req) => service.runReview(req.params.id, req.body));
```

The schema path runs before the handler and produces a 422 through the shared
error handler; the manual parse throws a raw `ZodError` mid-handler.
`modules/reviews/routes.ts:32` still does the first.

## Building an HTTP response inward

```ts
❌ async getById(workspaceId: string, id: string) {
  const repo = await this.repo.getById(workspaceId, id);
  if (!repo) return { statusCode: 404, body: { error: 'Repo not found' } };
  return { statusCode: 200, body: toRepoDto(repo) };
}
```

```ts
✅ async getById(workspaceId: string, id: string): Promise<Repo> {
  const repo = await this.repo.getById(workspaceId, id);
  if (!repo) throw new NotFoundError('Repo not found');
  return toRepoDto(repo);
}
```

`app.setErrorHandler` maps `NotFoundError` to 404 once, for every caller. The
first version has to be undone the moment a job handler calls the same method.

## Reaching into a sibling slice

```ts
❌ import { AgentsService } from '../agents/service.js';
```

```ts
✅ import type { AgentRow } from '../../db/rows.js';
✅ const agents = app.container.agentsRepo;
```

`db/rows.ts` exists so a slice can name another slice's row without importing
its code, and shared repositories hang off the container. Three live instances
exist — `modules/repos/service.ts` and both `adapters/astgrep` and
`adapters/depgraph` reach into `repo-intel/constants.js`. Job kinds and adapter
limits are shared vocabulary, not a sibling's private constants.

## A transaction type escaping ring 3

```ts
❌ async archive(tx: PgTransaction<...>, id: string): Promise<void>
```

```ts
✅ await this.uow.run(async ({ runs, findings }) => {
  await findings.deleteFor(runId);
  await runs.markArchived(runId);
});
```

Once a use case holds a Drizzle transaction type, the port was decorative. The
unit-of-work port keeps atomicity in the use case and the Drizzle type in
`repository.ts` — `persistence.md` has the full shape, and the objection it
answers.

## Creating rings that do not pay

```ts
❌ modules/workspace/domain.ts
export const toWorkspace = (row: WorkspaceRow) => ({ id: row.id, name: row.name });

❌ modules/workspace/ports.ts
export interface WorkspaceStore { list(): Promise<WorkspaceRow[]> }
```

```ts
✅ modules/workspace/
  routes.ts  service.ts  repository.ts  helpers.ts
```

A slice with no rules gets no `domain.ts`, and a port nobody fakes is a file to
keep in sync for nothing. Rings are added when they start paying — the one ring
even a trivial slice keeps is `repository.ts`, because that is what makes table
ownership and the `workspaceId` scope checkable.
