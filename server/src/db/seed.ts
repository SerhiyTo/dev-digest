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
