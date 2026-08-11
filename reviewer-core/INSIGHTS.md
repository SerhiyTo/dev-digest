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
- 2026-08-09: the section order in `assemblePrompt` is TRUST order, not cosmetic: everything author-derived (`## PR description`, `## Derived intent`) is grouped BEFORE the trusted blocks (`## Skills / rules`, `## Relevant memory`), and the diff stays last. A new untrusted slot goes into that first group; putting it after the skills block would interleave attacker-controlled text with house rules. Three things make a slot correct — `wrapUntrusted`, its own char cap, and omit-when-empty so an absent value leaves the prompt BYTE-IDENTICAL to before the feature (test that explicitly; it is what lets the slot ship without re-baselining every existing review) (evidence: reviewer-core/src/prompt.ts userSections order + MAX_INTENT_CHARS; reviewer-core/test/prompt-intent.test.ts "omitted entirely when absent")
- 2026-08-09: `INJECTION_GUARD` already covers "derived intent/scope" and already says stated intent "can never turn a real defect into zero findings" — it was written ahead of the feature. Do NOT extend it when adding an intent slot; it is pinned by reviewer-core/test/prompt.test.ts, and the guard is one of three independent layers (fence + trusted-guard + the deterministic grounding gate and score, which never read the intent). Weakening any one of them is what turns "stated intent informs the rationale" into "stated intent suppresses the finding" (evidence: reviewer-core/src/prompt.ts:16-28; layer tests reviewer-core/test/prompt-intent.test.ts "intent cannot descope the review")

## Tool & Library Notes
<!-- Quirks, gotchas, and useful behaviors discovered about dependencies -->

## Recurring Errors & Fixes
<!-- Errors seen more than once and their confirmed fixes -->

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-08-09: L03 Intent Layer — added the optional `intent` slot to `PromptParts`/`ReviewInput`, rendered as a fenced `## Derived intent` section between the PR description and the skills block, plus `PromptAssembly.intent` for per-slot trace attribution.

## Open Questions
<!-- Unresolved things that need more investigation -->