import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Every prompt says the paths are not checked out. Without it the agent goes looking for
// `server/src/modules/checkout/domain.ts`, does not find it, and stops to ask — which is how
// a run ended up with 1 turn and 0 tool calls while the judge scored it as a detection miss.
const FRAME = `Audit this diff against DevDigest's documented structural contracts.

The diff below is the complete artefact under review. These paths are not checked out in the
working tree, so review the diff as given rather than opening the files. You may still read the
repo's own rule sources (the dependency-cruiser config, the skills) to ground a finding.`;

// Two violations, and they are deliberately of different kinds.
//   1. `domain.ts` importing `fastify` trips two REAL dependency-cruiser rules —
//      `ring-1-domain-stays-pure` and `ring-2-service-not-to-framework` (both `error`).
//      A rule identifier exists, so the case may demand it.
//   2. `new PgCheckoutRepository()` inside a service trips NO mechanical rule. It is a
//      judgement-pass finding ("a service constructor takes its ports"). No identifier exists,
//      so demanding one would be demanding an invention.
// That asymmetry is the point: a grounded reviewer cites the ID where there is one and states
// the rule in prose where there is not.
const REVIEW_PROMPT = `${FRAME}

${fx("checkout-service.diff")}`;

// Both violations here are judgement-pass only. `core-stays-pure` does NOT cover either:
// its `to` matches server paths (`src/adapters/`, `src/db/`, `src/modules/`, …), so a
// `node:fs` import does not trip it, and no rule anywhere describes the grounding gate.
// The agent's own contract carries them in prose: "reviewer-core purity — No DB, fs, GitHub or
// server imports. The grounding gate is mandatory and never bypassed."
const REVIEWER_CORE_PROMPT = `${FRAME}

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a module file, no
// new imports, no cross-layer edges). A grounded reviewer reports zero findings and says what it
// checked to be sure — which is what the agent's report format prescribes for the empty case.
const BENIGN_PROMPT = `${FRAME}

${fx("benign-refactor.diff")}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should
// move between the two runs is whether the rule identifier keeps being cited in case 0.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags `server/src/modules/checkout/domain.ts` importing a type from 'fastify' as a ring violation — ring 1 may not depend on the delivery framework",
      "names the dependency-cruiser rule that covers that import — `ring-1-domain-stays-pure` or `ring-2-service-not-to-framework` — rather than describing it only in prose",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of dependency-injection discipline: a service takes its ports, and concrete repositories are constructed only in the composition root",
      "states the rule behind the `new PgCheckoutRepository()` finding in prose without inventing a rule identifier for it, since no dependency-cruiser rule covers it",
      "assigns each finding a severity from this repo's own scale — CRITICAL, WARNING or SUGGESTION",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "the output contains a line starting with `## Verdict` immediately followed by a count of findings broken down into CRITICAL / WARNING / SUGGESTION numbers (e.g. `2 findings — 0 CRITICAL, 2 WARNING, 0 SUGGESTION`), with no preamble text before it",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter beyond the ring violation caused by the `fastify` import itself (no runtime bug or security finding dressed up as an architecture rule)",
      "stays scoped to structural, layering and dependency-injection findings; anything it notices about security, performance or test quality is placed under `## Out of scope` rather than reported as a finding",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "grounds reviewer-core violations in the documented purity contract",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation — reviewer-core does no I/O, and everything external arrives injected",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "states the rule behind each finding in prose (e.g. 'reviewer-core does no I/O', 'the grounding gate is mandatory') without attributing either finding to a dependency-cruiser rule identifier such as `core-stays-pure` — that rule only matches server-path imports, so citing it for `node:fs` or the gate bypass would be a mis-citation",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "the output contains a line starting with `## Verdict` immediately followed by a count of findings broken down into CRITICAL / WARNING / SUGGESTION numbers, with no preamble text before it",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or records only non-blocking SUGGESTION-level observations) — it does not invent a CRITICAL or WARNING finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the `## Verdict` line states zero findings, and names at least one concrete thing it checked (e.g. ring placement, import direction, dependency-cruiser output) rather than a bare 'no violations found'",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
];
