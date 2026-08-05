# Changelog, deprecation and release notes

The verdict is only half the work. A MAJOR that nobody can act on is the same
outage as a MAJOR that nobody announced.

**Contents**

- [Who the entry is for](#who-the-entry-is-for)
- [Entry format](#entry-format)
- [Good and bad entries](#good-and-bad-entries)
- [Deprecation notices](#deprecation-notices)
- [The migration section](#the-migration-section)
- [Commit messages and the bump](#commit-messages-and-the-bump)

---

## Who the entry is for

Someone who did not write the change, is mid-upgrade, and wants to know two
things: *does this affect me* and *what do I type*. Everything else is noise.

That single reader explains every rule below — why breaking changes go first,
why "improved error handling" is worthless, and why an entry that omits the old
name cannot be searched by the person who has the old name in their editor.

## Entry format

Keep Semantic Versioning's grouping and Keep a Changelog's section names. The
`Breaking` group leads, always.

```markdown
## 2.0.0 — 2026-08-06

### Breaking
- `FindingRecord.dismissed_at` is now `rejected_at`. The value and semantics are
  unchanged — rename your reads.
- `POST /pulls/:id/review` returns `202` with `{ run_ids }` instead of `200`
  with the completed reviews. Subscribe to `/runs/:id/events` for results.

### Added
- `FindingRecord.confidence` (optional, `0..1`) on findings from LLM providers
  that report it.

### Fixed
- Severity filter dropped `SUGGESTION` rows when combined with a category filter.

### Migration
1. Replace `dismissed_at` with `rejected_at` across client reads.
2. Any caller of `POST /pulls/:id/review` that awaited the response body must
   now subscribe to the SSE stream. See `docs/…`.
```

Rules that matter more than the format:

- **Name the old thing.** People search the changelog for the symbol that just
  broke. If the entry only names the new one, they will not find it.
- **One line per consumer-visible change**, not per commit. Nobody upgrading
  cares that it took four commits.
- **Say what to do**, not only what happened. `dismissed_at` → `rejected_at` is
  actionable; "refactored finding records" is not.
- **Internal changes do not get an entry.** A changelog full of refactors trains
  people to skip it, which is exactly when you need them reading it.
- **Date every release.** Someone will need to correlate it with an incident.

## Good and bad entries

```markdown
❌ ### Changed
   - Improved the review API
   - Refactored findings
   - Bug fixes and improvements
```
Three lines that answer neither question. The reader still has to read the diff —
which is the job the changelog exists to remove.

```markdown
✅ ### Breaking
   - `POST /pulls/:id/review` now returns `202 { run_ids }` instead of the
     completed reviews. Await `/runs/:id/events` instead of the response body.
```

```markdown
❌ ### Breaking
   - Renamed a field on the finding record.
```
No old name, no new name, no file. Unsearchable.

```markdown
❌ ### Added
   - `grounding_mode` on `CreateReviewRequest`.
```
Filed under `Added`, but if the field is required this is a MAJOR — the section
it lands in is part of the classification, not a formatting choice. Either make
it optional and keep the `Added` heading, or move it to `Breaking`.

## Deprecation notices

Deprecation is what makes the next MAJOR affordable — announce in a MINOR, keep
the old path working, remove in the MAJOR.

**The marker itself belongs to `deprecation-policy`**, which owns the exact
`@deprecated` / `@removeAfter` / `@migration` format, the removal windows, and
the audit that catches expired ones. Do not write a competing format here. What
this skill is responsible for is the two numbers around it: the announcement is a
MINOR (it changes what the API promises, so never a PATCH) and the removal is the
MAJOR, in a later release.

The changelog entry is this skill's half of the job:

```markdown
### Deprecated
- `FindingRecord.dismissed_at` — use `rejected_at`. Removed in 3.0.
```

## The migration section

Required for every MAJOR. It answers "what do I type", in order.

- **Ordered steps**, because order is often load-bearing (migrate the database,
  then deploy, then flip reads — reverse it and you have downtime).
- **A codemod or `sed` line** when the change is mechanical. A rename across 40
  files should ship with the command that does it.
- **What happens if they skip it** — build error, 4xx, silent wrong value. This
  is how someone decides whether to upgrade today or next sprint.
- **Rollback**, when the change is not reversible. Dropped columns and executed
  migrations deserve a sentence saying so out loud.

## Commit messages and the bump

This repo uses conventional-commit-style prefixes loosely (`feature:`, `fix:`).
Where a commit convention exists, keep the mapping honest, because tooling and
readers both infer the level from it:

| Commit | Implies |
|---|---|
| `fix:` | PATCH |
| `feature:` / `feat:` | MINOR |
| `feat!:`, or a `BREAKING CHANGE:` footer | MAJOR |

The failure mode is a `fix:` commit that carries a break — a tightened
validation, a corrected default, a renamed field done "while I was in there".
The prefix says PATCH, the change is MAJOR, and nothing catches it. When the
classification and the prefix disagree, the classification is right: change the
prefix, or split the commit.
