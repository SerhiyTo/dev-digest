# Examples — ten pairs from this repo

The four pairs in `SKILL.md` cover the base cases: deleting a shared helper,
renaming a contract field, retiring an endpoint, and a marker with no clock.
These are the ten that come after, in the order they tend to bite.

---

## 1. A React prop

`client/src/vendor/ui/primitives/Badge.tsx`

```tsx
// ✗ Bad — the prop is gone; every call site is a compile error in client/
export function Badge({ children, tone }: { children?: React.ReactNode; tone?: BadgeTone }) {
```

```tsx
// ✓ Good — both accepted, new one wins, dev-only warning, dated removal
export function Badge({ children, color, tone }: {
  children?: React.ReactNode;
  /**
   * @deprecated since 0.5.0 — use `tone`, which maps to the SEV/CAT tokens
   * @removeAfter 0.7.0 2026-11-04
   * @migration client/specs/2026-08-06-badge-tone.md
   */
  color?: string;
  tone?: BadgeTone;
}) {
  if (process.env.NODE_ENV !== "production" && color !== undefined) {
    console.warn("Badge: `color` is deprecated, use `tone` (removed after 2026-11-04)");
  }
  const resolved = tone ? TONE[tone] : color;
```

A primitive used across the whole app is the surface with the most call sites and
the least type coverage — props are spread, forwarded and built dynamically. The
dev warning catches what `rg` cannot see.

---

## 2. An env var

`server/src/platform/config.ts`

```ts
// ✗ Bad — every deployment and every .env in the team fails at boot
- DEVDIGEST_CLONE_DIR: z.string().optional(),
+ DEVDIGEST_WORKSPACE_DIR: z.string().optional(),
```

```ts
// ✓ Good — read both, prefer the new one, announce in the logs
/**
 * @deprecated since 0.5.0 — use `DEVDIGEST_WORKSPACE_DIR`
 * @removeAfter 0.7.0 2026-11-04
 * @migration server/specs/2026-08-06-workspace-dir.md
 */
DEVDIGEST_CLONE_DIR: z.string().optional(),
DEVDIGEST_WORKSPACE_DIR: z.string().optional(),
```

The bad version has no compile error anywhere, no failing test, and takes down
every environment that has not had its `.env` edited. Reading the old name costs
three lines and turns a MAJOR into a MINOR. Update `.env.example` in the same
commit.

---

## 3. A feature flag

`REPO_INTEL_ENABLED`, same schema.

```ts
// ✗ Bad — the flag and the losing branch disappear together
- if (!config.REPO_INTEL_ENABLED) return degradedToRipgrep();
```

```ts
// ✓ Good — the flag becomes a no-op that still tells the operator
if (env.REPO_INTEL_ENABLED === 'false') {
  logger.warn('REPO_INTEL_ENABLED is deprecated and no longer honoured; repo-intel is always on (key removed after 2026-11-04)');
}
```

Somebody set that flag to `false` on purpose. Deleting the branch silently
reverses their decision and gives them no way to discover it — the behaviour
changes and the config that used to control it is still sitting in their `.env`
looking effective.

---

## 4. A whole module

```
// ✗ Bad — the folder is deleted and the barrel edited in one PR
- server/src/modules/legacy-brief/**
```

```ts
// ✓ Good — the module stays, its entry points are marked, the routes announce
/**
 * @deprecated since 0.5.0 — use the `brief` module; this one predates SmartDiff
 * @removeAfter 0.7.0 2026-11-04
 * @migration server/specs/2026-08-06-legacy-brief-retirement.md
 */
export default async function legacyBriefRoutes(app: FastifyInstance) {
```

A module is not one surface, it is every symbol it exports plus every route it
registers. Mark the **entry points** — the plugin function and each route — rather
than every internal helper: internals were never reachable, and marking them
teaches people to ignore markers.

Deregistering it from `modules/index.ts` is the removal, not the announcement.
Until then it stays registered and answering.

---

## 5. Deprecating and fixing a bug in one commit

```ts
// ✗ Bad — the consumer now has two problems and no stable reference point
/**
 * @deprecated since 0.5.0 — use {@link reduceReviewsV2}
 * @removeAfter 0.7.0 2026-11-04
 * @migration reviewer-core/specs/2026-08-06-reduce-v2.md
 */
export function reduceReviews(parts: Review[]): Review {
-  return parts.flatMap((p) => p.findings);
+  return dedupeByFileAndLine(parts.flatMap((p) => p.findings));
}
```

```ts
// ✓ Good — two commits. Fix first, or freeze and fix only in the replacement.
```

A deprecated path is a **reference point**: consumers compare the new behaviour
against it while migrating. Changing both at once means a consumer who hits a
difference cannot tell whether the replacement is wrong or the old path moved
under them.

The exception is a security fix, which lands everywhere immediately — including
in code that is on its way out.

---

## 6. Removal day

```ts
// ✗ Bad — the code is gone, the marker survives, the spec still says "planned"
/**
 * @deprecated since 0.5.0 — use {@link buildPrBriefV2}
 * @removeAfter 0.7.0 2026-11-04
 * @migration server/specs/2026-08-06-brief-v2.md
 */
```

```
// ✓ Good — the removal commit does four things
1. delete the symbol / route / prop / key
2. delete its marker
3. update the @migration spec: "removed in 0.7.0, 2026-11-06"
4. bump the version — major (pre-1.0: minor)

then: bash .claude/skills/deprecation-policy/assets/deprecation-audit.sh
```

A marker outliving its subject sends the next reader to a symbol that does not
exist. A clean audit run after the removal is the evidence that step 2 happened.

---

## 7. The marked field that is still required

`server/src/vendor/shared/contracts/knowledge.ts`

```ts
// ✗ Bad — marked, but a caller that stops sending it fails validation
/**
 * @deprecated since 0.5.0 — use `evidence`
 * @removeAfter 0.7.0 2026-11-04
 * @migration server/specs/2026-08-06-convention-evidence.md
 */
evidence_path: z.string(),
evidence: z.array(ConventionEvidence),
```

```ts
// ✓ Good — loosened in the same commit as the marker
evidence_path: z.string().optional(),
evidence: z.array(ConventionEvidence),
```

The two paths have to actually coexist. A required field with a marker is a
deprecation on paper and a hard dependency in practice — the consumer is told to
stop using something they cannot stop sending.

---

## 8. The marker in one copy

```
// ✗ Bad — marked in server/, forgotten in client/
server/src/vendor/shared/contracts/knowledge.ts   ← marker added
client/src/vendor/shared/contracts/knowledge.ts   ← untouched
```

```
// ✓ Good — byte-identical, same commit
cp server/src/vendor/shared/contracts/knowledge.ts \
   client/src/vendor/shared/contracts/knowledge.ts
```

`pr-self-review`'s `check_contract_mirror` fails this, so it will not merge — but
the reason it is a real error rather than a lint nit: the two packages would
disagree about what the contract says, and the half that never saw the marker is
the half whose editor never strikes the symbol through.

---

## 9. The field that is present but always null

```ts
// ✗ Bad — kept in the schema, no longer populated. A removal wearing a marker.
grounding: z.string().nullish(),   // handler stopped setting it in 0.5.0
```

```ts
// ✓ Good — keep populating it for the whole window
return { ...review, grounding: groundingSummary(result), groundingDetail: result };
```

The window exists so consumers can migrate against a working old path. A field
that parses and is always `null` breaks every consumer that reads it, on the day
the marker was added, while looking compliant to the audit script.

The same trap in HTTP form: a route that starts returning `202` and an empty body
instead of the resource, but keeps answering. Still there, no longer useful.

---

## 10. The second extension

```ts
// ✗ Bad — the date has moved twice; the marker now means nothing
- * @removeAfter 0.7.0 2026-11-04
+ * @removeAfter 0.8.0 2027-02-04
```

```markdown
✓ Good — first slip: extend once, with the reason in the migration spec.
  "Extended to 2027-02-04: the replacement cannot express per-agent overrides
   yet (server/specs/2026-08-06-brief-v2.md#gap)."

✓ Good — second slip: withdraw the deprecation instead.
  Remove the marker, say why in the spec, re-announce when the replacement is
  genuinely ready.
```

A date that moves whenever it is inconvenient is not a commitment, and once
people learn that, no marker in the codebase is load-bearing. Withdrawing is
embarrassing and honest; slipping repeatedly is comfortable and corrosive.

`deprecation-audit.sh` exits non-zero on an overdue marker precisely so that this
decision gets made by a person rather than by drift.
