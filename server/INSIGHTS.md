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
- 2026-07-29: ALWAYS add new fields to RunStats/RunTrace as `.nullish()`, never plain/`.nullable()` — `run_traces.trace` is frozen jsonb written at run completion, so historical documents lack the key and a required field breaks client-side `RunTrace.parse` on every pre-existing trace (evidence: server/src/vendor/shared/contracts/trace.ts:65; regression test server/test/contracts.test.ts "historical stats without cost_usd")
- 2026-07-29: per-PR aggregates on `GET /repos/:id/pulls` (score, cost) follow one IN-query + JS Map, and must stay NULL-preserving — SQL `SUM` skips NULLs and returns NULL for all-NULL groups; NEVER coerce with `?? 0` or the UI shows a fabricated $0.00 instead of "—" (evidence: server/src/modules/pulls/routes.ts cost aggregate; it-test "PR list aggregates cost")

## Tool & Library Notes
<!-- Quirks, gotchas, and useful behaviors discovered about dependencies -->
- 2026-07-29: Claude 5-family models (claude-sonnet-5, claude-opus-5, …) reject `temperature` with 400 "temperature is deprecated for this model" — ALWAYS route Anthropic tuning params through `anthropicTuningParams()`, which omits temperature when the major version ≥ 5; mirrors the existing `tuningParams()` pattern for GPT-5/o-series in openai.ts (evidence: server/src/adapters/llm/anthropic.ts anthropicTuningParams; test server/test/adapters.test.ts "anthropic tuning params")

## Recurring Errors & Fixes
<!-- Errors seen more than once and their confirmed fixes -->

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-07-29: fixed 400 on Claude Sonnet 5 runs — Anthropic adapter now omits temperature for 5-family models (anthropicTuningParams + unit tests).
- 2026-07-29: re-added per-run cost (agent_runs.cost_usd, migration 0010, contracts, PR-list SUM aggregate) reversing d45ab0d; TDD across server+client.

## Open Questions
<!-- Unresolved things that need more investigation -->