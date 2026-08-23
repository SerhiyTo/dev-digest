import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSectionKind = z.enum([
  'architecture',
  'critical_paths',
  'run_locally',
  'reading_path',
  'first_tasks',
]);
export type OnboardingSectionKind = z.infer<typeof OnboardingSectionKind>;

export const OnboardingCriticalPathEntry = z.object({
  path: z.string(),
  reason: z.string(),
});
export type OnboardingCriticalPathEntry = z.infer<typeof OnboardingCriticalPathEntry>;

export const OnboardingRunLocallyStep = z.object({
  command: z.string(),
  note: z.string().nullish(),
});
export type OnboardingRunLocallyStep = z.infer<typeof OnboardingRunLocallyStep>;

export const OnboardingReadingPathStep = z.object({
  path: z.string(),
  rationale: z.string(),
});
export type OnboardingReadingPathStep = z.infer<typeof OnboardingReadingPathStep>;

export const OnboardingTaskComplexity = z.enum(['low', 'medium', 'high']);
export type OnboardingTaskComplexity = z.infer<typeof OnboardingTaskComplexity>;

export const OnboardingFirstTask = z.object({
  title: z.string(),
  hint_path: z.string(),
  complexity: OnboardingTaskComplexity,
});
export type OnboardingFirstTask = z.infer<typeof OnboardingFirstTask>;

// `kind` is a closed five-value set; a section carries markdown `body` and,
// only for the structured payload matching its own `kind`, one of the four
// arrays below. All four are `.nullish()` so a pre-structured stored row
// still parses, and `body` alone renders when the payload is absent.
export const OnboardingSection = z.object({
  kind: OnboardingSectionKind,
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
  critical_paths: z.array(OnboardingCriticalPathEntry).nullish(),
  run_locally: z.array(OnboardingRunLocallyStep).nullish(),
  reading_path: z.array(OnboardingReadingPathStep).nullish(),
  first_tasks: z.array(OnboardingFirstTask).nullish(),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
  degraded: z.boolean().default(false),
  degraded_reason: z.string().nullish(),
});
export type Onboarding = z.infer<typeof Onboarding>;

export const OnboardingGenerationStatus = z.enum(['running', 'done', 'failed']);
export type OnboardingGenerationStatus = z.infer<typeof OnboardingGenerationStatus>;

// The read contract the screen consumes: the stored tour (if any) plus its
// provenance and the state of the generation that produced or is producing
// it. `cost_usd` is the displayed tour's cost; `failed_cost_usd` is the most
// recent failed attempt's cost — two separate fields because a failure must
// never overwrite the cost of the tour still on screen (AC-58, AC-63, AC-65).
export const OnboardingView = z.object({
  tour: Onboarding.nullable(),
  status: OnboardingGenerationStatus.nullable(),
  failure_reason: z.string().nullish(),
  generated_at: z.string().nullish(),
  files_indexed: z.number().int().nullish(),
  generated_sha: z.string().nullish(),
  current_sha: z.string().nullish(),
  model: z.string().nullish(),
  cost_usd: z.number().nullable(),
  failed_cost_usd: z.number().nullable(),
});
export type OnboardingView = z.infer<typeof OnboardingView>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum([
  'manual', 'imported_file', 'imported_url', 'extracted', 'community',
]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  label: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const SkillStats = z.object({
  used_by: z.number().int(),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
  pull_frequency: z.number().nullish(),
  accept_rate: z.number().nullish(),
  findings_30d: z.number().int(),
  findings_by_category: z.record(z.string(), z.number().int()),
});
export type SkillStats = z.infer<typeof SkillStats>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
// A candidate's evidence is a VERIFIED citation: the server re-finds each
// snippet in the file it names and recomputes the line numbers, so `path:lines`
// is always true regardless of what the model reported.
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionEvidence = z.object({
  path: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  snippet: z.string(),
});
export type ConventionEvidence = z.infer<typeof ConventionEvidence>;

// `occurrence_files` is null when the rule carried no usable probe regex —
// "not measured", which the UI hides. It is never coerced to 0, which would
// claim the repo was searched and the rule found nowhere.
export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  evidence: z.array(ConventionEvidence),
  occurrence_files: z.number().int().nullish(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScanStatus = z.enum(['never', 'running', 'done', 'failed']);
export type ConventionScanStatus = z.infer<typeof ConventionScanStatus>;

// Every nullable metric here means "not measured" and renders as an omitted
// chip, never as a zero (same honesty rule as SkillStats).
export const ConventionScanState = z.object({
  status: ConventionScanStatus,
  sampled_files: z.number().int(),
  selected_files: z.number().int(),
  candidate_count: z.number().int(),
  dropped_count: z.number().int(),
  dropped_reasons: z.record(z.string(), z.number().int()),
  path_prefix: z.string().nullish(),
  cost_usd: z.number().nullish(),
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
  model: z.string().nullish(),
  last_scan_at: z.string().nullish(),
  degraded_reason: z.string().nullish(),
  error: z.string().nullish(),
});
export type ConventionScanState = z.infer<typeof ConventionScanState>;

export const ConventionsView = z.object({
  state: ConventionScanState,
  candidates: z.array(ConventionCandidate),
});
export type ConventionsView = z.infer<typeof ConventionsView>;

// `existing_skill` + `body_patch` are set when this repo already has an
// extracted convention skill: the merge updates it to a new version instead of
// leaving a near-identical duplicate behind.
export const ConventionSkillDraft = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  evidence_files: z.array(z.string()),
  merged_count: z.number().int(),
  existing_skill: z
    .object({ id: z.string(), name: z.string(), version: z.number().int() })
    .nullish(),
  body_patch: z.string().nullish(),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
