# Changelog

Versioning policy for this skill:

- **major** — a default answer reverses, a surface is added or dropped, or the
  sequence changes shape.
- **minor** — a new reference file, a new detection scan, a new row in the
  default-answers table.
- **patch** — wording, corrected claims about the tree, added examples.

## 1.0.1 — 2026-08-06

**Fixed** — from the first run of the skill against a real branch (`lab-2-hw`,
merge-base `66727c8`).

- The claim that `git diff` detection has **no false positives** was wrong, in
  both `SKILL.md` and `references/detection.md`. A line that is only reflowed,
  reordered or reindented is a removed line to `grep` and nothing to a consumer.
  The scans are tuned to miss nothing and pay for it in noise; the docs now say
  so instead of promising precision they do not have.
- `references/detection.md` — *Reading a hit* gained a step 0: compare the
  parsed shape with `--ignore-all-space` before treating a `-` line as a
  candidate. It carries the warning the live run produced — a reflow and a real
  change can share one hunk, so the `+` side has to be read before anything is
  dismissed.

The run itself validated the rest: the four scans found three genuine
undeclared breaks on that branch (`SkillSource` response enum widened;
`ConventionCandidate.evidence_path`, `.evidence_snippet` and `.accepted`
removed and replaced), with no expand step and no marker — which is exactly the
single CRITICAL case `references/gate.md` declares.

## 1.0.0 — 2026-08-06

Initial release.

- `SKILL.md` — the four surfaces and their detection commands, the
  expand → migrate → contract sequence, the database section, six good/bad
  pairs, the five-step gate, and the dev-digest project profile.
- `references/detection.md` — per-surface `git diff` scans anchored to the
  merge-base, plus the changes that leave no removed line (new required fields,
  tightened validation, changed defaults, response-enum growth, semantics).
- `references/rollout.md` — the three steps, why they cannot be merged, deploy
  ordering, the two-deploy window, per-step rollback safety.
- `references/database.md` — the surface with nowhere to put a marker: migration
  pairs, the `NOT NULL` three-step, constraints `NOT VALID`, text-enum direction,
  and why a column rename need not become a contract rename.
- `references/gate.md` — the five steps, the single CRITICAL case, the report
  shape, and integration with `pr-self-review`.
- `references/examples.md` — eleven good/bad pairs on real symbols in this repo.
- `evals/evals.json` — five evals, including one that must produce *no* ceremony
  (module-local deletion) and one semantic change with no schema diff.
- Wiring: routing and severity rows in `pr-self-review`, catalog row in
  `.claude/skills/README.md`.

**Scope, after finding two neighbours already in the tree.** `semver-discipline`
and `deprecation-policy` were added to `.claude/skills/` the same day this skill
was written, and between them they own the MAJOR/MINOR/PATCH verdict, the
`@deprecated` marker format and the removal window. An earlier draft of this
skill carried its own version registry (`contracts/registry.ts`) and its own
per-surface windows; both were cut rather than shipped alongside contradicting
guidance in the same folder. What remains is what neither neighbour covers:
detection in the diff, the release sequence, the database surface (which
`deprecation-policy` explicitly excludes), and the pre-merge gate.

Corrected during authoring, all three found by checking claims against the tree
rather than trusting recall:

- `agent-runner/` is referenced by `reviewer-core/src/index.ts` and by
  `pr-self-review`'s routing table, but **no such directory exists**. The skill
  now says the CI runner is outside this tree — which strengthens the point, since
  no repo-wide grep can see that consumer.
- `groundFindings` takes `(findings: Finding[], diff: UnifiedDiff)`, not
  `(review, diff)`.
- `RunEvent` has no `type` field. The wire enum is `RunEventKind`
  (`info | tool | result | error`), and it is also a storage format — whole runs
  are persisted as jsonb `RunTrace` documents, so changing a value breaks every
  trace already written.
