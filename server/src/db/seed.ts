import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import { assemblePrompt } from '@devdigest/reviewer-core';
import type { RunLogLine, RunTrace, PrBrief } from '@devdigest/shared';
import { loadConfig } from '../platform/config.js';
import { assembleProjectContext } from '../modules/context/assemble.js';
import { taskLine } from '../modules/reviews/helpers.js';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
} from './seed-prompts.js';
import {
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
  TEST_COVERAGE_RUBRIC_DESCRIPTION,
  TEST_COVERAGE_RUBRIC_BODY,
  FLAKY_TEST_SIGNALS_DESCRIPTION,
  FLAKY_TEST_SIGNALS_BODY,
  API_CONTRACT_COMPAT_DESCRIPTION,
  API_CONTRACT_COMPAT_BODY,
} from './seed-skills.js';
import { INDEXER_VERSION } from '../modules/repo-intel/constants.js';
import { seedEvalCases, EVAL_CASE_SETS_BY_AGENT_NAME } from './seed-evals.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, the three built-in agents (General + Security +
 * Performance), three base skills (test-coverage-rubric, flaky-test-signals,
 * api-contract-compat) with their version-1 snapshots, and two skill-driven
 * agents (Test Quality Reviewer, API Contract Reviewer) with those skills
 * linked in an explicit order — all on the default
 * openrouter/deepseek-v4-flash provider+model.
 *
 * `mock-overuse-gate` is deliberately NOT seeded: it is imported live through
 * the UI to demonstrate the import-and-vet flow (source stays in
 * `docs/agent-prompts/skills/mock-overuse-gate.{md,zip}`).
 *
 * Also three untriaged convention candidates plus the completed scan row that
 * produced them, so the Conventions page has content without an LLM call.
 *
 * Also a persistent repo-intel index (repo_index_state/symbols/references/
 * file_rank/file_facts) for acme/payments-api and a second, merged PR #415
 * that also touches src/middleware/ratelimit.ts — without these the Blast
 * Radius card has nothing to render (the seeded clone below holds project
 * documentation only and no source files, so getBlastRadius's live path
 * would still come back empty + degraded).
 *
 * Also a fixture clone for acme/payments-api under the configured clone
 * directory (`AppConfig.cloneDir`/acme/payments-api, the same path the clone
 * job would write) holding four markdown documents under docs/ and specs/,
 * with repos.clone_path pointed at it. Without it Project Context discovery
 * finds nothing for the demo repo and reports `not_cloned`.
 *
 * Also one completed agent_runs row for PR #482 (Security Reviewer, status
 * `done`) and its run_traces document, whose prompt_assembly and specs_read
 * carry the fixture clone's specs/idempotency-keys.md. Without it the run-trace
 * drawer has no run to open, since it mounts on `?trace=<runId>` and every
 * opener renders from agent_runs — the seeded review alone puts nothing there.
 * The trace is built through the real assembler, so its bytes match a live run.
 *
 * Also at least 8 eval cases (`seed-evals.ts`) owned by the Security Reviewer
 * agent, so `pnpm verify:l06` and the eval dashboard have a runnable regression
 * set without an LLM call. One PR #482 finding is marked accepted, one
 * dismissed, and the finding seeded on PR #415 is left undecided, giving every
 * finding action state a deterministic starting point.
 *
 * Remaining course lessons populate the other tables (memory, …) once their
 * features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export const DEMO_REPO_OWNER = 'acme';
export const DEMO_REPO_NAME = 'payments-api';

/**
 * Project-context fixture for the demo clone. Every path starts with one of the
 * four scanned roots (docs/specs/plans/insights) or discovery will not see it,
 * and every body stays far under MAX_DOC_CHARS so no cap fires. The text is
 * fixed: e2e flow 09 waits on lines from it.
 */
export const DEMO_REPO_DOCS: Readonly<Record<string, string>> = {
  'docs/architecture.md': `# Architecture

The payments API takes card and wallet charges for merchants on the Acme
platform. It is one Node service in front of Postgres, reaching the card
networks through a single vendor gateway.

Every payment request enters through the public gateway and leaves through the ledger writer.

## Components

- src/api/public/ is the merchant-facing HTTP surface.
- src/middleware/ratelimit.ts applies a token bucket to every public route.
- src/ledger/ is the append-only double-entry ledger and the only writer of ledger_entries.
- src/gateway/ is the vendor client, and the only module allowed to hold network credentials.

## Invariants

- A charge reaches the ledger before the merchant is told it succeeded.
- The ledger is append-only: a correction is a new entry, never an update.
- No module outside src/gateway/ may talk to the card networks.
`,
  'docs/runbooks/incident-response.md': `# Runbook: payment incident response

Page the on-call payments engineer before touching the ledger writer.

## Severity

| Level | Trigger | First response |
|---|---|---|
| SEV1 | Charge failures above 5% for five minutes | Page on-call, open an incident channel |
| SEV2 | Refunds queued longer than 30 minutes | Page on-call during business hours |
| SEV3 | Raised gateway latency with no failures | File a ticket |

## Steps

1. Read the blast radius off the gateway dashboard before changing anything.
2. Disable the affected merchant, never the whole gateway.
3. Reconcile the ledger against the vendor report once the incident is closed.
`,
  'specs/idempotency-keys.md': `# Spec: idempotency keys

Status: accepted

An idempotency key is valid for exactly 24 hours and is scoped to one merchant.

## Requirements

- Every mutating request under /api/public must carry an Idempotency-Key header.
- A replay with the same key and the same body returns the first response and its status code.
- A replay with the same key and a different body is rejected with 409 Conflict.
- The stored response is what a replay returns, so a replay never re-enters the gateway.
`,
  'specs/refund-window.md': `# Spec: refund window

Status: accepted

A refund may be issued for 90 days after capture, and never after the dispute closes.

## Requirements

- A partial refund is allowed while the remaining refundable amount is above zero.
- A refund writes two ledger entries and never mutates the original charge.
- A refund asked for after the window is rejected with 422 and the capture date.
`,
};

export const DEMO_RUN_AGENT_NAME = 'Security Reviewer';
export const DEMO_RUN_DOC_PATH = 'specs/idempotency-keys.md';

/**
 * Fixed identity of the fixture run. `ranAt` doubles as the natural key the
 * select-then-insert below matches on — `agent_runs` has no unique constraint,
 * so a stable timestamp is what keeps re-seeding from stacking duplicate runs.
 */
const DEMO_RUN_RAN_AT = new Date('2026-08-20T09:15:00Z');

const DEMO_FINDING_ACCEPTED_AT = new Date('2026-08-25T10:00:00Z');
const DEMO_FINDING_DISMISSED_AT = new Date('2026-08-25T10:05:00Z');

const DEMO_RUN_DIFF = `diff --git a/src/api/public/webhooks.ts b/src/api/public/webhooks.ts
--- a/src/api/public/webhooks.ts
+++ b/src/api/public/webhooks.ts
@@ -42,6 +42,12 @@ export async function handleWebhook(req: Request, res: Response) {
   const merchantId = req.headers['x-merchant-id'];
+  const key = req.headers['idempotency-key'];
+  if (!key) {
+    return res.status(400).json({ error: 'Idempotency-Key header is required' });
+  }
+
+  await rateLimit({ key: bucketKey(req), limit: 100, windowMs: 60_000 });
   const event = await gateway.verify(req.rawBody, req.headers['x-signature']);
   return res.json(await ledger.record(merchantId, event));
 }
`;

const DEMO_WEBHOOK_HUNK_ONLY_PATCH = DEMO_RUN_DIFF.split('\n').slice(3).join('\n');

const DEMO_CONFIG_STRIPE_KEY_PATCH = `@@ -1,15 +1,15 @@
 import dotenv from 'dotenv';

 dotenv.config();

 export const config = {
   port: Number(process.env.PORT) || 3000,
   env: process.env.NODE_ENV || 'development',
   dbHost: process.env.DB_HOST,
   dbPort: Number(process.env.DB_PORT) || 5432,
   redisUrl: process.env.REDIS_URL,
   webhookSigningSecret: process.env.WEBHOOK_SIGNING_SECRET,
-  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
+  stripeSecretKey: 'sk_live_xxx',
   rateLimitWindowMs: 60_000,
   rateLimitMax: 100,
 };`;

const DEMO_USERS_N_PLUS_ONE_PATCH = `@@ -40,14 +40,18 @@
 export async function listUsers(req, res) {
   const { ids } = req.query;
   if (!Array.isArray(ids)) {
     throw new Error('ids must be an array');
   }
-  const users = await db.query(
-    'SELECT * FROM users WHERE id = ANY($1)',
-    [ids],
-  );
+  const users = [];
+  for (const id of ids) {
+    const [user] = await db.query(
+      'SELECT * FROM users WHERE id = $1',
+      [id],
+    );
+    users.push(user);
+  }
   return res.json(users);
 }

 export async function getUserProfile(id) {
   return db.query('SELECT * FROM users WHERE id = $1', [id]);`;

const DEMO_RUN_RAW_OUTPUT = `{
  "verdict": "approve",
  "summary": "The new Idempotency-Key guard on the public webhook matches specs/idempotency-keys.md: the header is mandatory on a mutating public route and a missing key is rejected before the gateway is reached. No secret handling, injection or SSRF surface is introduced by this diff.",
  "findings": []
}`;

const DEMO_RUN_LOG: RunLogLine[] = [
  { t: '09:15:00', kind: 'info', msg: 'Diff ready — 1 changed file(s); starting 1 agent run(s)' },
  {
    t: '09:15:00',
    kind: 'info',
    msg: `Starting review with agent "${DEMO_RUN_AGENT_NAME}" (${DEFAULT_PROVIDER}/${DEFAULT_MODEL})`,
  },
  { t: '09:15:01', kind: 'info', msg: 'skills: 0 attached' },
  { t: '09:15:01', kind: 'info', msg: 'project context: 1 injected, 0 skipped' },
  { t: '09:15:08', kind: 'tool', msg: 'review_file src/api/public/webhooks.ts' },
  { t: '09:15:08', kind: 'result', msg: 'Persisted review with 0 finding(s)' },
  { t: '09:15:08', kind: 'info', msg: 'Run complete; trace persisted' },
];

/**
 * Build the fixture trace through the REAL assembler, so the bytes the drawer
 * shows are the bytes a live run would have produced: `assembleProjectContext`
 * supplies the path-labelled document and `assemblePrompt` does the positional
 * `<untrusted source="spec-0">` fencing and the `## Project context` section.
 */
function demoRunTrace(pull: typeof t.pullRequests.$inferSelect): RunTrace {
  const { specs, specsRead } = assembleProjectContext([
    { path: DEMO_RUN_DOC_PATH, text: DEMO_REPO_DOCS[DEMO_RUN_DOC_PATH]! },
  ]);
  const { assembly } = assemblePrompt({
    system: SECURITY_REVIEWER_PROMPT,
    specs,
    diff: DEMO_RUN_DIFF,
    task: taskLine(pull),
    ...(pull.body ? { prDescription: pull.body } : {}),
  });

  return {
    config: {
      agent: DEMO_RUN_AGENT_NAME,
      version: '1',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      pr: pull.number,
      source: 'local',
    },
    stats: {
      duration_ms: 8420,
      tokens_in: 6180,
      tokens_out: 742,
      cost_usd: 0.0031,
      findings: 0,
      grounding: '0/0 passed',
    },
    prompt_assembly: assembly,
    tool_calls: [
      { tool: 'review_file', args: 'src/api/public/webhooks.ts', meta: 'single-pass', ms: 8420 },
    ],
    raw_output: DEMO_RUN_RAW_OUTPUT,
    memory_pulled: [],
    specs_read: specsRead,
    log: DEMO_RUN_LOG,
  };
}

const DEMO_BRIEF_GENERATED_AT = new Date('2026-08-21T09:30:00Z');
const DEMO_BRIEF_STARTED_AT = new Date('2026-08-21T09:29:40Z');
const DEMO_BRIEF_FINISHED_AT = new Date('2026-08-21T09:29:52Z');

function demoBriefDocument(pull: typeof t.pullRequests.$inferSelect): PrBrief {
  return {
    intent: {
      intent:
        'Add rate limiting to the public API surface so unauthenticated clients cannot exhaust merchant-facing endpoints.',
      in_scope: ['src/middleware/ratelimit.ts', 'src/api/public/webhooks.ts'],
      out_of_scope: ['src/gateway/'],
      risk_areas: [{ label: 'Public endpoint abuse', severity: 'medium' }],
      evidence: [
        {
          kind: 'pr_body',
          detail: 'PR body states the rate-limiting goal directly.',
          weight: 0.6,
        },
      ],
      confidence: 0.82,
    },
    blast: {
      changed_symbols: [
        { name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' },
        { name: 'bucketKey', file: 'src/middleware/ratelimit.ts', kind: 'function' },
      ],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [
            { name: 'registerRoutes', file: 'src/api/public/index.ts', line: 23, kind: 'call' },
            { name: 'handleWebhook', file: 'src/api/public/webhooks.ts', line: 45, kind: 'call' },
            { name: 'registerHealthRoute', file: 'src/api/public/health.ts', line: 11, kind: 'call' },
            { name: 'scheduleRateBucketReset', file: 'src/server.ts', line: 88, kind: 'call' },
          ],
          endpoints_affected: [
            'GET /api/public/items',
            'POST /api/public/webhooks',
            'GET /api/public/health',
          ],
          crons_affected: ['reset-rate-buckets'],
        },
      ],
      summary:
        'rateLimit reaches three public HTTP endpoints and one scheduled job through four call sites.',
    },
    risks: {
      risks: [
        {
          kind: 'security',
          title: 'Config module worth a credential audit before merge',
          severity: 'medium',
          file_refs: ['src/config.ts'],
          explanation:
            'src/config.ts centralizes provider configuration read into the app, and the new rate-limiter settings land in the same file — confirm no committed credential rides along before merging.',
        },
        {
          kind: 'performance',
          title: 'N+1 query risk in user listing under new limiter',
          severity: 'medium',
          file_refs: ['src/api/users.ts:45-52'],
          explanation:
            'The rate limiter raises the request volume this endpoint must absorb, and the existing per-user loop still issues one query per row, which will scale worse once bursts are smoothed instead of rejected outright.',
        },
        {
          kind: 'reliability',
          title: 'Token-bucket edge cases have no test coverage',
          severity: 'low',
          file_refs: ['src/middleware/ratelimit.ts:25-40'],
          explanation:
            'src/middleware/ratelimit.ts introduces bucket refill logic without accompanying tests for burst and reset boundaries, leaving the edge behaviour unverified.',
        },
      ],
    },
    history: {
      history: [
        {
          pr_number: 415,
          title: 'Introduce token-bucket rate limiter scaffolding',
          merged_at: '2026-07-04T16:30:00Z',
          author: 'diego.reyes',
          files_overlap: ['src/middleware/ratelimit.ts', 'src/config.ts'],
          notes: 'Laid the groundwork this PR builds on; no incidents were reported after merge.',
        },
      ],
    },
    summary:
      'Adds token-bucket rate limiting to the public API surface: the webhook now requires an Idempotency-Key header and shares a limiter with the other public routes. Two moderate risks surfaced — a config file worth a credential check and an N+1 query under load — with nothing blocking.',
    merge_risk: 'medium',
    review_focus: [
      {
        file: 'src/api/public/webhooks.ts',
        start_line: 44,
        end_line: 46,
        reason: 'Confirm the Idempotency-Key header lookup is case-insensitive across proxies.',
      },
      {
        file: 'src/api/public/webhooks.ts',
        start_line: 48,
        end_line: 49,
        reason: 'Check that the rate-limit bucket key cannot collide across merchants.',
      },
    ],
    file_summaries: [
      {
        path: 'src/middleware/ratelimit.ts',
        summary:
          'Adds a token-bucket rate limiter with a configurable key, limit and window, exposed for reuse across public routes.',
      },
      {
        path: 'src/config.ts',
        summary:
          "Adds the rate limiter's key, limit and window settings to the shared config module.",
      },
    ],
    degraded_reason: null,
    truncated: false,
    head_sha: pull.headSha,
    model: DEFAULT_MODEL,
    review_models: ['seed'],
    tokens_in: 8210,
    tokens_out: 960,
    cost_usd: 0.0042,
  };
}

/**
 * Materialise the fixture clone. Idempotent by construction: fixed paths, fixed
 * bodies, recursive mkdir and a whole-file write, so a second run reproduces the
 * same tree rather than appending to it.
 */
async function writeDemoClone(cloneDir: string): Promise<string> {
  const clonePath = join(cloneDir, DEMO_REPO_OWNER, DEMO_REPO_NAME);
  for (const [docPath, body] of Object.entries(DEMO_REPO_DOCS)) {
    const file = join(clonePath, ...docPath.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body, 'utf8');
  }
  return clonePath;
}

/**
 * Seeded agents are inserted with a bare `db.insert(t.agents)` rather than
 * through `AgentsRepository.insert()`, so they never get the version-1
 * `agent_versions` snapshot that `snapshotVersion` writes on a real create.
 * Backfill it here, select-then-insert on `(agent_id, version)` so a second
 * seed run — or a database seeded before this fix existed — converges rather
 * than duplicating. `skills` is always `[]`: a real version-1 snapshot is
 * written immediately after insert, before any skill is linked, and linking a
 * skill afterwards does not bump the version or re-snapshot.
 */
async function ensureInitialAgentVersionSnapshot(
  db: Db,
  agent: typeof t.agents.$inferSelect,
): Promise<void> {
  const [existingSnapshot] = await db
    .select({ agentId: t.agentVersions.agentId })
    .from(t.agentVersions)
    .where(and(eq(t.agentVersions.agentId, agent.id), eq(t.agentVersions.version, agent.version)));
  if (existingSnapshot) return;
  await db
    .insert(t.agentVersions)
    .values({
      agentId: agent.id,
      version: agent.version,
      configJson: {
        provider: agent.provider,
        model: agent.model,
        system_prompt: agent.systemPrompt,
        output_schema: agent.outputSchema,
        strategy: agent.strategy,
        ci_fail_on: agent.ciFailOn,
        repo_intel: agent.repoIntel,
        skills: [],
      },
    })
    .onConflictDoNothing();
}

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) + its project-context fixture clone ----
  const demoFullName = `${DEMO_REPO_OWNER}/${DEMO_REPO_NAME}`;
  const demoClonePath = await writeDemoClone(loadConfig().cloneDir);

  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, demoFullName)));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: DEMO_REPO_OWNER,
        name: DEMO_REPO_NAME,
        fullName: demoFullName,
        defaultBranch: 'main',
        clonePath: demoClonePath,
        createdBy: userId,
      })
      .returning();
  } else if (repo.clonePath !== demoClonePath) {
    [repo] = await db
      .update(t.repos)
      .set({ clonePath: demoClonePath })
      .where(eq(t.repos.id, repo.id))
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  const [pr482Review] = await db
    .select({ id: t.reviews.id })
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.kind, 'review')));
  if (pr482Review) {
    await db
      .update(t.findings)
      .set({ acceptedAt: DEMO_FINDING_ACCEPTED_AT })
      .where(
        and(
          eq(t.findings.reviewId, pr482Review.id),
          eq(t.findings.title, 'Hardcoded Stripe secret key in commit'),
        ),
      );
    await db
      .update(t.findings)
      .set({ dismissedAt: DEMO_FINDING_DISMISSED_AT })
      .where(
        and(
          eq(t.findings.reviewId, pr482Review.id),
          eq(t.findings.title, 'N+1 query in user list endpoint'),
        ),
      );
  }

  await db
    .update(t.prFiles)
    .set({ patch: DEMO_WEBHOOK_HUNK_ONLY_PATCH })
    .where(and(eq(t.prFiles.prId, pr!.id), eq(t.prFiles.path, 'src/api/public/webhooks.ts')));

  await db
    .update(t.prFiles)
    .set({ patch: DEMO_CONFIG_STRIPE_KEY_PATCH })
    .where(and(eq(t.prFiles.prId, pr!.id), eq(t.prFiles.path, 'src/config.ts')));

  await db
    .update(t.prFiles)
    .set({ patch: DEMO_USERS_N_PLUS_ONE_PATCH })
    .where(and(eq(t.prFiles.prId, pr!.id), eq(t.prFiles.path, 'src/api/users.ts')));

  const demoBrief = demoBriefDocument(pr!);
  const demoBriefValues = {
    json: demoBrief,
    headSha: demoBrief.head_sha,
    model: demoBrief.model,
    provider: DEFAULT_PROVIDER,
    tokensIn: demoBrief.tokens_in,
    tokensOut: demoBrief.tokens_out,
    costUsd: demoBrief.cost_usd,
    degradedReason: demoBrief.degraded_reason,
    truncated: demoBrief.truncated,
    generatedAt: DEMO_BRIEF_GENERATED_AT,
  };
  await db
    .insert(t.prBrief)
    .values({ prId: pr!.id, ...demoBriefValues })
    .onConflictDoUpdate({ target: t.prBrief.prId, set: demoBriefValues });

  const demoBriefGenerationValues = {
    workspaceId,
    status: 'done' as const,
    provider: DEFAULT_PROVIDER,
    model: demoBrief.model,
    tokensIn: demoBrief.tokens_in,
    tokensOut: demoBrief.tokens_out,
    costUsd: demoBrief.cost_usd,
    degradedReason: demoBrief.degraded_reason,
    error: null,
    startedAt: DEMO_BRIEF_STARTED_AT,
    finishedAt: DEMO_BRIEF_FINISHED_AT,
  };
  await db
    .insert(t.prBriefGenerations)
    .values({ prId: pr!.id, ...demoBriefGenerationValues })
    .onConflictDoUpdate({
      target: t.prBriefGenerations.prId,
      set: demoBriefGenerationValues,
    });

  // ---- repo-intel: persistent index for acme/payments-api (Blast Radius) ----
  // rateLimit/bucketKey declared in the changed src/middleware/ratelimit.ts,
  // called from the four sites the design mock shows, plus a couple of
  // symbols in the other changed files so changed_symbols isn't thin.
  const [existingIndexState] = await db
    .select({ repoId: t.repoIndexState.repoId })
    .from(t.repoIndexState)
    .where(eq(t.repoIndexState.repoId, repoId));
  if (!existingIndexState) {
    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'a1b2c3d4e5f6',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 46,
      filesSkipped: 2,
      stats: {},
    });

    // symbols declared in the PR's changed files
    await db
      .insert(t.symbols)
      .values([
        {
          repoId,
          path: 'src/middleware/ratelimit.ts',
          name: 'rateLimit',
          kind: 'function',
          line: 25,
          endLine: 40,
          exported: true,
          signature: 'function rateLimit(opts: RateLimitOptions)',
        },
        {
          repoId,
          path: 'src/middleware/ratelimit.ts',
          name: 'bucketKey',
          kind: 'function',
          line: 42,
          endLine: 48,
          exported: false,
          signature: 'function bucketKey(req: Request)',
        },
        {
          repoId,
          path: 'src/api/public/webhooks.ts',
          name: 'handleWebhook',
          kind: 'function',
          line: 30,
          endLine: 60,
          exported: true,
        },
        {
          repoId,
          path: 'src/config.ts',
          name: 'loadConfig',
          kind: 'function',
          line: 5,
          endLine: 20,
          exported: true,
        },
        {
          repoId,
          path: 'src/api/users.ts',
          name: 'listUsers',
          kind: 'function',
          line: 40,
          endLine: 55,
          exported: true,
        },
        // enclosing symbols for the caller files, so blast doesn't fall back
        // to the file basename when naming the caller
        {
          repoId,
          path: 'src/api/public/index.ts',
          name: 'registerRoutes',
          kind: 'function',
          line: 10,
          endLine: 60,
          exported: true,
        },
        {
          repoId,
          path: 'src/api/public/health.ts',
          name: 'registerHealthRoute',
          kind: 'function',
          line: 5,
          endLine: 15,
          exported: true,
        },
        {
          repoId,
          path: 'src/server.ts',
          name: 'scheduleRateBucketReset',
          kind: 'function',
          line: 80,
          endLine: 100,
          exported: true,
        },
      ])
      .onConflictDoNothing();

    // callers of rateLimit/bucketKey — decl_file is the changed ratelimit.ts
    await db.insert(t.references).values([
      {
        repoId,
        fromPath: 'src/api/public/index.ts',
        toSymbol: 'rateLimit',
        line: 23,
        declFile: 'src/middleware/ratelimit.ts',
      },
      {
        repoId,
        fromPath: 'src/api/public/webhooks.ts',
        toSymbol: 'rateLimit',
        line: 45,
        declFile: 'src/middleware/ratelimit.ts',
      },
      {
        repoId,
        fromPath: 'src/api/public/health.ts',
        toSymbol: 'rateLimit',
        line: 11,
        declFile: 'src/middleware/ratelimit.ts',
      },
      {
        repoId,
        fromPath: 'src/server.ts',
        toSymbol: 'rateLimit',
        line: 88,
        declFile: 'src/middleware/ratelimit.ts',
      },
      {
        repoId,
        fromPath: 'src/api/public/webhooks.ts',
        toSymbol: 'bucketKey',
        line: 52,
        declFile: 'src/middleware/ratelimit.ts',
      },
      {
        repoId,
        fromPath: 'src/server.ts',
        toSymbol: 'bucketKey',
        line: 92,
        declFile: 'src/middleware/ratelimit.ts',
      },
    ]);

    // file_rank — mandatory for every caller from_path (inner join in getResolvedCallers)
    await db
      .insert(t.fileRank)
      .values([
        {
          repoId,
          filePath: 'src/api/public/index.ts',
          pagerank: 0.42,
          hotness: 0,
          rank: 0.42,
          percentile: 88,
        },
        {
          repoId,
          filePath: 'src/api/public/webhooks.ts',
          pagerank: 0.31,
          hotness: 0,
          rank: 0.31,
          percentile: 75,
        },
        {
          repoId,
          filePath: 'src/api/public/health.ts',
          pagerank: 0.08,
          hotness: 0,
          rank: 0.08,
          percentile: 30,
        },
        {
          repoId,
          filePath: 'src/server.ts',
          pagerank: 0.55,
          hotness: 0,
          rank: 0.55,
          percentile: 95,
        },
      ])
      .onConflictDoNothing();

    // file_facts — endpoints/crons attributed to the caller files above
    await db
      .insert(t.fileFacts)
      .values([
        {
          repoId,
          filePath: 'src/api/public/index.ts',
          endpoints: ['GET /api/public/items'],
          crons: [],
        },
        {
          repoId,
          filePath: 'src/api/public/webhooks.ts',
          endpoints: ['POST /api/public/webhooks'],
          crons: [],
        },
        {
          repoId,
          filePath: 'src/api/public/health.ts',
          endpoints: ['GET /api/public/health'],
          crons: [],
        },
        {
          repoId,
          filePath: 'src/server.ts',
          endpoints: [],
          crons: ['reset-rate-buckets'],
        },
      ])
      .onConflictDoNothing();
  }

  // ---- prior PR #415 also touching src/middleware/ratelimit.ts (Blast Radius history) ----
  let [priorPr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 415)));
  if (!priorPr) {
    [priorPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 415,
        title: 'Introduce token-bucket rate limiter scaffolding',
        author: 'diego.reyes',
        branch: 'feat/rate-limit-scaffold',
        base: 'main',
        headSha: 'f9e8d7c6b5a4',
        additions: 96,
        deletions: 12,
        filesCount: 3,
        status: 'merged',
        body: 'Lays the groundwork for the token-bucket limiter that #482 builds on.',
        openedAt: new Date('2026-07-02T10:00:00Z'),
        updatedAt: new Date('2026-07-04T16:30:00Z'),
      })
      .returning();

    await db.insert(t.prFiles).values([
      { prId: priorPr!.id, path: 'src/middleware/ratelimit.ts', additions: 40, deletions: 0 },
      { prId: priorPr!.id, path: 'src/middleware/index.ts', additions: 12, deletions: 2 },
      { prId: priorPr!.id, path: 'src/config.ts', additions: 8, deletions: 0 },
    ]);
  }

  const [priorUndecidedFinding] = await db
    .select({ id: t.findings.id })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .where(
      and(
        eq(t.reviews.prId, priorPr!.id),
        eq(t.findings.title, 'Rate-limit bucket key omits repo-level scoping'),
      ),
    );
  if (!priorUndecidedFinding) {
    const [priorReview] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: priorPr!.id,
        kind: 'review',
        verdict: 'comment',
        summary:
          'Scaffolding looks reasonable; one item worth a second look before it lands elsewhere.',
        score: 78,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values({
      reviewId: priorReview!.id,
      file: 'src/middleware/index.ts',
      startLine: 12,
      endLine: 12,
      severity: 'WARNING',
      category: 'security',
      title: 'Rate-limit bucket key omits repo-level scoping',
      rationale:
        'The bucket key is derived from the merchant header alone, so two repos behind the same merchant share one bucket.',
      suggestion: 'Fold the repo id into the bucket key alongside the merchant id.',
      confidence: 0.72,
    });
  }

  // ---- base skills (L02: reusable rubric/convention blocks) ----
  // Bodies live in ./seed-skills.ts (mirrored in docs/agent-prompts/skills/*.md).
  // `mock-overuse-gate` is intentionally absent — imported live through the UI.
  const seedSkills: Array<{
    name: string;
    description: string;
    type: (typeof t.skills.$inferInsert)['type'];
    body: string;
  }> = [
    {
      name: 'test-coverage-rubric',
      description: TEST_COVERAGE_RUBRIC_DESCRIPTION,
      type: 'rubric',
      body: TEST_COVERAGE_RUBRIC_BODY,
    },
    {
      name: 'flaky-test-signals',
      description: FLAKY_TEST_SIGNALS_DESCRIPTION,
      type: 'custom',
      body: FLAKY_TEST_SIGNALS_BODY,
    },
    {
      name: 'api-contract-compat',
      description: API_CONTRACT_COMPAT_DESCRIPTION,
      type: 'convention',
      body: API_CONTRACT_COMPAT_BODY,
    },
  ];

  const skillIdByName = new Map<string, string>();
  for (const s of seedSkills) {
    let [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (!existing) {
      [existing] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: s.name,
          description: s.description,
          type: s.type,
          source: 'manual',
          body: s.body,
          enabled: true,
          version: 1,
        })
        .returning();
      // Same shape as the skills module's create path (SkillsRepository.insert):
      // the initial body snapshot is recorded as skill_versions version 1.
      await db
        .insert(t.skillVersions)
        .values({ skillId: existing!.id, version: 1, body: s.body, label: null })
        .onConflictDoNothing();
    }
    skillIdByName.set(s.name, existing!.id);
  }

  // ---- conventions (untriaged candidates + the scan that produced them) ----
  // Seeded so the Conventions page and its e2e flow have deterministic content
  // without an LLM call. Evidence cites the same files as the seeded findings.
  const seedConventions = [
    {
      rule: 'Configuration is read once into a typed config object, never from process.env inline.',
      confidence: 0.91,
      occurrenceFiles: 7,
      evidence: [
        {
          path: 'src/config.ts',
          start_line: 10,
          end_line: 12,
          snippet: '  port: 3000,\n  redisUrl: x,',
        },
      ],
    },
    {
      rule: 'Public API routes are rate limited at the middleware layer, not per handler.',
      confidence: 0.78,
      occurrenceFiles: null,
      evidence: [
        {
          path: 'src/middleware/ratelimit.ts',
          start_line: 25,
          end_line: 27,
          snippet: 'export function rateLimit(opts: RateLimitOptions) {',
        },
      ],
    },
    {
      rule: 'Callers reach shared clients through a single exported singleton module.',
      confidence: 0.85,
      occurrenceFiles: 4,
      evidence: [
        {
          path: 'src/api/public/index.ts',
          start_line: 23,
          end_line: 23,
          snippet: "import { rateLimit } from '../../middleware/ratelimit';",
        },
      ],
    },
  ];

  const [existingConvention] = await db
    .select({ id: t.conventions.id })
    .from(t.conventions)
    .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  if (!existingConvention) {
    await db.insert(t.conventions).values(
      seedConventions.map((c) => ({
        workspaceId,
        repoId,
        rule: c.rule,
        evidence: c.evidence,
        occurrenceFiles: c.occurrenceFiles,
        confidence: c.confidence,
        status: 'pending' as const,
      })),
    );
    await db
      .insert(t.conventionScans)
      .values({
        repoId,
        workspaceId,
        status: 'done',
        pathPrefix: null,
        sampledFiles: 84,
        selectedFiles: seedConventions.flatMap((c) => c.evidence.map((e) => e.path)),
        candidateCount: seedConventions.length,
        droppedCount: 0,
        droppedReasons: {},
        model: 'seed',
        finishedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // ---- built-in agents (the three starter presets, plus two skill-driven ones) ----
  // Prompt bodies live in ./seed-prompts.ts / ./seed-skills.ts (mirrored in
  // docs/agent-prompts/*.md). `skillLinks` sets agent_skills.order explicitly —
  // that order is what the prompt assembler uses for the Skills block.
  const seedAgents: Array<
    typeof t.agents.$inferInsert & {
      skillLinks?: Array<{ skillName: string; order: number }>;
    }
  > = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description:
        "Judges whether the diff's tests actually exercise and pin the behaviour that changed.",
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
      skillLinks: [
        { skillName: 'test-coverage-rubric', order: 0 },
        { skillName: 'flaky-test-signals', order: 1 },
      ],
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Checks whether an API change stays safe for existing, unmodified callers.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
      skillLinks: [{ skillName: 'api-contract-compat', order: 0 }],
    },
  ];
  const agentIdByName = new Map<string, string>();
  for (const { skillLinks, ...agentValues } of seedAgents) {
    let [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentValues.name)));
    if (!existing) {
      [existing] = await db.insert(t.agents).values(agentValues).returning();
    }
    await ensureInitialAgentVersionSnapshot(db, existing!);
    agentIdByName.set(agentValues.name, existing!.id);
    if (skillLinks) {
      for (const link of skillLinks) {
        const skillId = skillIdByName.get(link.skillName);
        if (!skillId) continue;
        await db
          .insert(t.agentSkills)
          .values({ agentId: existing!.id, skillId, order: link.order })
          .onConflictDoNothing();
      }
    }
  }

  const securityReviewerId = agentIdByName.get(DEMO_RUN_AGENT_NAME);
  if (securityReviewerId) {
    await db
      .update(t.reviews)
      .set({ agentId: securityReviewerId })
      .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.kind, 'review')));
  }

  for (const [agentName, cases] of EVAL_CASE_SETS_BY_AGENT_NAME) {
    const evalAgentId = agentIdByName.get(agentName);
    if (!evalAgentId) continue;
    await seedEvalCases(db, { workspaceId, agentId: evalAgentId, cases });
  }

  // ---- completed fixture run for PR #482, with its project-context trace ----
  // Deliberately NOT linked to the seeded review (reviews.run_id stays null):
  // this row exists so the run-trace drawer has something to open, and linking
  // it would pull the Review Runs accordion the PR-findings flow asserts on
  // into this change's blast radius for no gain.
  const demoRunAgentId = agentIdByName.get(DEMO_RUN_AGENT_NAME);
  if (demoRunAgentId) {
    let [demoRun] = await db
      .select({ id: t.agentRuns.id })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.prId, pr!.id),
          eq(t.agentRuns.agentId, demoRunAgentId),
          eq(t.agentRuns.ranAt, DEMO_RUN_RAN_AT),
        ),
      );
    if (!demoRun) {
      [demoRun] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: demoRunAgentId,
          prId: pr!.id,
          ranAt: DEMO_RUN_RAN_AT,
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          durationMs: 8420,
          tokensIn: 6180,
          tokensOut: 742,
          status: 'done',
          source: 'local',
          findingsCount: 0,
          grounding: '0/0 passed',
          score: 88,
          blockers: 0,
          costUsd: 0.0031,
        })
        .returning({ id: t.agentRuns.id });
    }
    await db
      .insert(t.runTraces)
      .values({ runId: demoRun!.id, trace: demoRunTrace(pr!) })
      .onConflictDoUpdate({
        target: t.runTraces.runId,
        set: { trace: demoRunTrace(pr!) },
      });
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
