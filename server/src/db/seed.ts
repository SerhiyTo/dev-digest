import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
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
 * Radius card has nothing to render (repos.clonePath is null here, so both
 * of getBlastRadius's paths would otherwise come back empty + degraded).
 *
 * Remaining course lessons populate the other tables (memory, eval, …) once
 * their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

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

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
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
  for (const { skillLinks, ...agentValues } of seedAgents) {
    let [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentValues.name)));
    if (!existing) {
      [existing] = await db.insert(t.agents).values(agentValues).returning();
    }
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
