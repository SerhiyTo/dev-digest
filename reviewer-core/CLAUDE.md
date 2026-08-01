# @devdigest/reviewer-core — pure review engine

diff → prompt → LLM → grounded findings. No DB, no GitHub, no filesystem; the
only side effect is an LLM call through an injected `LLMProvider`. Uses **npm**.

## Commands

- `npm test` — vitest
- `npm run typecheck` — also what `build` does; **this package never emits JS**
  (server consumes the TS source via tsconfig path alias)

## Map

- `review/run.ts` — orchestrates a run (single-pass by default)
- `prompt.ts` — `assemblePrompt()`; untrusted content fencing (`wrapUntrusted`
  + `INJECTION_GUARD`)
- `llm/` — provider (openrouter) + `structured.ts` (Zod → JSON Schema,
  parse-with-repair)
- `grounding.ts` — `groundFindings()`, the citation gate
- `output/` — finding/review shapes

## Gotchas / Do not touch

- **Purity is the contract:** never import DB, fs, GitHub, or server code here.
  Everything external arrives injected. This is what makes it mock-testable.
- **Grounding gate is mandatory:** findings that don't cite a real diff line
  are dropped; never bypass it.
- **Score is recomputed deterministically** from surviving findings — never
  trust the model's self-reported score.
- Prompt-injection fencing (`wrapUntrusted`) must wrap ALL untrusted input
  (diffs, repo content) before it reaches the prompt.

## Docs

- `README.md` — pipeline diagram, consumer wiring
- `docs/` — topic docs
- `specs/` — feature specs; find the spec before implementing a feature
- `INSIGHTS.md` — lessons from past sessions. Read it before starting work
  here (high-confidence guidance). At wrap-up run the `engineering-insights`
  skill — append only substantive, deduplicated entries; do not skip this step.
