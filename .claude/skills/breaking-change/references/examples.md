# Examples — good and bad, on this repo's files

Every pair below uses symbols that actually exist in dev-digest. The pattern is
the same throughout: the bad version is defensible while you look at the diff,
and indefensible the moment you look at a consumer.

---

## 1. Zod contract — the rename

`server/src/vendor/shared/contracts/review-api.ts`

```ts
// ❌ one PR: the contract, the mirror, and every call site
export const FindingRecord = Finding.extend({
  review_id: z.string(),
-  accepted_at: z.string().nullable(),
-  dismissed_at: z.string().nullable(),
+  acknowledged_at: z.string().nullable(),
+  rejected_at: z.string().nullable(),
});
```

```ts
// ✅ expand — four fields for one release, old two marked per deprecation-policy
export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
  rejected_at: z.string().nullable(),
});
```

The red version passes `pnpm typecheck` in both packages and passes
`check_contract_mirror`, because the mirror was updated in the same commit. What
it does not pass is a browser that loaded the client ten minutes ago and is
still reading `dismissed_at` off a payload that no longer has it.

Note also that `Finding` is fed to the LLM as structured output. A contract edit
here changes three consumers at once — the API, the client's inferred types, and
the model's response schema — and they fail in three different ways.

---

## 2. Zod contract — the response enum

`server/src/vendor/shared/contracts/findings.ts`

```ts
// ❌ "adding a value can't break anyone"
export const Verdict = z.enum(['request_changes', 'approve', 'comment', 'blocked']);
```

```ts
// ✅ safe going in, breaking coming out — check which direction this one travels
export const Verdict = z.enum(['request_changes', 'approve', 'comment']);
```

`Verdict` is on `ReviewRecord`, so it travels **out**. Every exhaustive `switch`
in the client falls through on `'blocked'`, and TypeScript will not warn the
client until it recompiles — which happens after the server already sent the new
value.

Adding a value to a request enum is the opposite and is a MINOR. The direction
rule is in `semver-discipline`; the sequence, if you need one, is here.

---

## 3. HTTP — the route rename

`server/src/modules/reviews/routes.ts`

```ts
// ❌ the client finds out in production
-  app.post('/findings/:id/dismiss', ...)
+  app.post('/findings/:id/reject', ...)
```

```ts
// ✅ both answer for one release; the old one announces its end
app.post('/findings/:id/dismiss', { schema: { params: IdParams } }, async (req, reply) => {
  reply.header('Sunset', 'Wed, 20 Aug 2026 23:59:59 GMT');
  return service.actOnFinding(req.params.id, 'dismiss');
});
app.post('/findings/:id/reject', { schema: { params: IdParams } }, async (req) =>
  service.actOnFinding(req.params.id, 'dismiss'),
);
```

No compiler anywhere in this repo connects a route string to its caller — the
caller is a template literal inside a `fetch`. The only way to find it is to grep
the string:

```bash
rg -n "findings/\$\{|findings/" client/src e2e
```

Header format and the exact window come from `deprecation-policy`.

---

## 4. HTTP — the shape that "is still a list"

```ts
// ❌ MINOR-looking, MAJOR in effect
// GET /pulls/:id/reviews  →  { items: ReviewRecord[], next_cursor: string }
//                    was:    ReviewRecord[]
```

```ts
// ✅ opt in, so an unchanged caller sees an unchanged response
// GET /pulls/:id/reviews                 →  ReviewRecord[]
// GET /pulls/:id/reviews?page_size=50    →  { items, next_cursor }
```

Pagination added to an endpoint that used to return everything is the quietest
break in this catalog: the consumer keeps working and silently shows the first
page as though it were the whole set.

---

## 5. Database — the drop

`server/src/db/schema/reviews.ts` + `server/src/db/migrations/`

```sql
-- ❌ 0016_drop_score.sql
ALTER TABLE "reviews" DROP COLUMN "score";
```

```sql
-- ✅ 0016 expand — nullable, nothing reads it yet
ALTER TABLE "reviews" ADD COLUMN "quality_score" integer;

-- ✅ 0018 contract — separate PR, after reads moved and the window closed
ALTER TABLE "reviews" DROP COLUMN "score";
```

Two independent reasons the red version is wrong even when no code reads
`score`. The deploy is not atomic, so for a few minutes the old server inserts a
column the schema no longer has. And the drop is irreversible in a way reverting
the commit does not fix — the values are gone.

---

## 6. Database — the required column

`server/src/db/schema/skills.ts`

```ts
// ❌ every existing row violates it, and the migration fails on a non-empty table
origin: text('origin').notNull(),
```

```ts
// ✅ a default makes the same change additive
origin: text('origin').notNull().default('manual'),
```

If a default genuinely does not exist, it is three migrations: nullable,
backfill, `SET NOT NULL` — and step three waits for the last old writer to stop,
not for the last row to be filled. See `references/database.md`.

---

## 7. Package export — the barrel cleanup

`reviewer-core/src/index.ts`

```ts
// ❌ "nothing in server/ imports these"
-  export { toReviewPayload, gateTriggered, countBlockers } from './output/to-review.js';
+  export { toReviewPayload } from './output/to-review.js';
```

```bash
# ✅ prove it across every package, then remove and say so
rg -n --type ts '\b(gateTriggered|countBlockers)\b' server/src client/src reviewer-core/src e2e
```

Removing a symbol from a barrel while the file keeps it is still a removal: the
barrel is the surface. And a clean grep is necessary but not sufficient here —
`reviewer-core/src/index.ts` documents a CI runner that bundles this package with
`@vercel/ncc` from outside this tree, so nothing in the repo can see that
consumer at all.

---

## 8. Package export — the signature

```ts
// ❌ every existing call site stops compiling
-  export function groundFindings(findings: Finding[], diff: UnifiedDiff): GroundingResult
+  export function groundFindings(findings: Finding[], diff: UnifiedDiff, mode: GroundingMode): GroundingResult
```

```ts
// ✅ optional with a default that preserves the old behaviour
export function groundFindings(
  findings: Finding[],
  diff: UnifiedDiff,
  mode: GroundingMode = 'strict',
): GroundingResult
```

The red version is a compile error in someone else's repo, which is the worst
place for it to surface. Adding an optional parameter at the end is a MINOR;
adding a required one, or reordering, is not.

---

## 9. The wire format that does not look like one

`server/src/vendor/shared/contracts/trace.ts`

```ts
// ❌ "it's just an internal enum"
-  export const RunEventKind = z.enum(['info', 'tool', 'result', 'error']);
+  export const RunEventKind = z.enum(['info', 'tool', 'final', 'error']);
```

`RunEventKind` is a wire format. `GET /runs/:id/events` streams `RunEvent` — with
`kind` on every message — to a client that switches on it, and a client holding
an open SSE connection does not reload because the server restarted. It is also
persisted: `RunTrace` stores whole runs as a jsonb document, so every historical
trace still holds `'result'` and now fails to parse on read.

Treat a `RunEventKind` value exactly like a response enum member: emit both for
one release, migrate readers and stored documents, then remove.

---

## 10. The silent one

```ts
// ❌ nothing in the schema changed; the meaning inverted
-  score: raw.score,                 // 0..100, higher is better
+  score: 100 - raw.score,           // now: lower is better
```

```ts
// ✅ a new meaning gets a new name and goes through the sequence
riskScore: z.number().int().min(0).max(100),
```

`Review.score` carries its semantics in a `.describe()` string that is fed to the
model — "HIGHER is better", with thresholds the prompt depends on. Inverting the
value changes the meaning of every stored row, every chart, and the model's own
calibration, while the type, the schema and any range assertion stay green.

This is the class the detection scans cannot find. The rule that covers it: when
the meaning of a value changes, the name changes with it. A rename is visible; a
reinterpretation is not.

---

## 11. What a good declaration looks like

```markdown
❌ "Renamed dismissed_at → rejected_at. Updated the mirror and all call sites. All green."
```

```markdown
✅ PR 1 — expand
   `FindingRecord.rejected_at` added; `dismissed_at` kept and marked
   (`@removeAfter 0.7.0 2026-11-04`). Both are written. No consumer changes.

   PR 2 — migrate
   client reads moved to `rejected_at`.
   rg -n --type ts '\bdismissed_at\b' server/src client/src reviewer-core/src e2e
   → 0 matches (output below)

   PR 3 — contract
   `dismissed_at` removed from the contract, the mirror and the row mapper.
```

"All green" is what the compressed version looks like. It is also the version
that cannot be rolled back: reverting PR 1 restores code that reads a field the
migration in the same PR already dropped.
