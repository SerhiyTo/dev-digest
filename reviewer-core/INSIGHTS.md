# Insights

Accumulated non-obvious lessons from working in this module. Read this before
starting work here and treat entries as high-confidence guidance. Append-only:
add bullets at the top of the matching section (newest first); never rewrite,
reorder, or delete existing content — correct a wrong entry with a new dated
note. Entry format: `- YYYY-MM-DD: <insight> (evidence: path/file.ts:line)`.

## What Works
<!-- Approaches, patterns, and solutions that have proven effective here -->

## What Doesn't Work
<!-- Failed approaches, dead ends, antipatterns to avoid -->

## Codebase Patterns
<!-- Module-specific conventions, architecture decisions, naming patterns -->
- 2026-08-30: the eval scorer's match rule (AC-28, overlap) and its citation-accuracy rule (AC-33, containment) are deliberately DIFFERENT range tests against the same widened window — a finding can overlap an expectation's ±3-line window enough to match while its own range still extends past the window on one side, which makes it matched but not accurately cited. Do not collapse these into one check; `citationAccuracy` would trivially become 1.0 for every match otherwise (evidence: reviewer-core/src/eval/score.ts `findingMatchesExpectation` uses `rangesOverlap`, `findingCitedWithinWindow` uses `rangeContains`; reviewer-core/test/eval-score.test.ts "excludes a matched finding whose full range is not contained in the widened window")
- 2026-08-30: `scoreEvalCase`/`aggregateEvalRun` never resolve a finding-to-expectation tie by input order — when multiple findings could match one expectation (or vice versa), the code checks "does ANY candidate match/satisfy X" rather than picking one via `.find()`, which is what makes AC-37's reordering-invariance hold without needing to sort the input arrays first (evidence: reviewer-core/src/eval/score.ts `findingsMatchedToMustFind` loop uses `matchingMustFind.some(...)`, not a single chosen expectation)
- 2026-08-23: the untrusted slots in `assemblePrompt` do NOT guard uniformly: `prDescription` and `intent` are omitted on `.trim().length > 0`, but `specs` is omitted only on `parts.specs.length > 0` — the array length, never the content. So `specs: ['']` renders a real `## Project context` heading wrapping an empty fence, and the byte-identical property (INSIGHTS:17) holds for `undefined` and `[]` but NOT for an array of empty strings. Any producer feeding this slot must drop empty bodies itself; do not "fix" it in `prompt.ts`, the omit-on-length behaviour is now pinned (evidence: reviewer-core/src/prompt.ts:97-99; reviewer-core/test/prompt-specs.test.ts "renders a heading for an empty document body")
- 2026-08-09: the section order in `assemblePrompt` is TRUST order, not cosmetic: everything author-derived (`## PR description`, `## Derived intent`) is grouped BEFORE the trusted blocks (`## Skills / rules`, `## Relevant memory`), and the diff stays last. A new untrusted slot goes into that first group; putting it after the skills block would interleave attacker-controlled text with house rules. Three things make a slot correct — `wrapUntrusted`, its own char cap, and omit-when-empty so an absent value leaves the prompt BYTE-IDENTICAL to before the feature (test that explicitly; it is what lets the slot ship without re-baselining every existing review) (evidence: reviewer-core/src/prompt.ts userSections order + MAX_INTENT_CHARS; reviewer-core/test/prompt-intent.test.ts "omitted entirely when absent")
- 2026-08-09: `INJECTION_GUARD` already covers "derived intent/scope" and already says stated intent "can never turn a real defect into zero findings" — it was written ahead of the feature. Do NOT extend it when adding an intent slot; it is pinned by reviewer-core/test/prompt.test.ts, and the guard is one of three independent layers (fence + trusted-guard + the deterministic grounding gate and score, which never read the intent). Weakening any one of them is what turns "stated intent informs the rationale" into "stated intent suppresses the finding" (evidence: reviewer-core/src/prompt.ts:16-28; layer tests reviewer-core/test/prompt-intent.test.ts "intent cannot descope the review")

## Tool & Library Notes
<!-- Quirks, gotchas, and useful behaviors discovered about dependencies -->

## Recurring Errors & Fixes
<!-- Errors seen more than once and their confirmed fixes -->

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-08-30: SPEC-04 eval pipeline T1 — added `src/eval/score.ts` and `src/eval/constants.ts` (`scoreEvalCase`, `aggregateEvalRun`, `EVAL_LINE_TOLERANCE`), exported from `index.ts`; added `test/eval-score.test.ts` and `test/eval-score-purity.test.ts`.
- 2026-08-23: L05 Project Context — added `test/prompt-specs.test.ts` pinning the `## Project context` slot's placement, its omit-when-absent byte-identity, and its fence-escaping properties against unmodified source; no `src/` change.
- 2026-08-09: L03 Intent Layer — added the optional `intent` slot to `PromptParts`/`ReviewInput`, rendered as a fenced `## Derived intent` section between the PR description and the skills block, plus `PromptAssembly.intent` for per-slot trace attribution.

## Open Questions
<!-- Unresolved things that need more investigation -->