# Surfaces — the recipe for each one

The three fields never change: **what replaces it**, **when it goes**, **where the
migration is written**. What changes is the idiom that carries them, because a
JSDoc block cannot reach an HTTP client and a `.env` file cannot be struck
through in an editor.

| Surface | The marker rides on | Reaches the consumer via |
|---|---|---|
| TS exports, types | JSDoc block above the symbol | tsserver strikethrough, `deprecation-audit.sh` |
| Zod contract field | JSDoc block above the field, in **both** vendored copies | the same, plus the inferred type |
| HTTP route / response field | `Deprecation` + `Sunset` + `Link` response headers | a deployed client that never recompiles |
| React prop | JSDoc block on the prop in the props type | tsserver, plus a dev-only `console.warn` |
| Env var | JSDoc block on the key in `EnvSchema`, plus a boot warning | the operator reading logs at startup |
| Feature flag | the same, plus the flag becoming a no-op | the operator, before the flag disappears |

Every one of them also gets the JSDoc block wherever a JSDoc block is possible —
that is what makes one `grep` find all of them and what lets the audit script
enforce the dates. The non-TypeScript idioms are *additional*, never instead.

---

## TypeScript exports

The base case. `reviewer-core/src/index.ts` and
`server/src/vendor/shared/index.ts` are the two barrels that make something
public here.

```ts
/**
 * @deprecated since 0.5.0 — use {@link groundFindingsWithMode}
 * @removeAfter 0.7.0 2026-11-04
 * @migration reviewer-core/specs/2026-08-06-grounding-mode.md
 */
export function groundFindings(findings: Finding[], diff: UnifiedDiff): GroundingResult {
  return groundFindingsWithMode(findings, diff, 'strict');
}
```

**The old symbol delegates; it does not duplicate.** Two bodies drift, and the
drift shows up as a bug in the path you already told people to stop using. One
body with a shim cannot.

Verify before removal:

```bash
rg -n --type ts '\bgroundFindings\b' server/src client/src reviewer-core/src e2e
```

Removing from the barrel while the source file keeps the export is still a
removal — the barrel is the surface.

---

## Zod contracts

`server/src/vendor/shared/contracts/*.ts`, mirrored byte-identically to
`client/src/vendor/shared/`. Both copies change in the same commit or
`check_contract_mirror` fails the PR.

```ts
export const Skill = z.object({
  id: z.string(),
  /**
   * @deprecated since 0.5.0 — use `origin`, which distinguishes file from URL
   * @removeAfter 0.7.0 2026-11-04
   * @migration server/specs/2026-08-06-skill-origin.md
   */
  source: SkillSource.optional(),
  origin: SkillOrigin,
});
```

Two rules specific to this surface:

- **A marked field must also be loosened.** A required field with a marker is
  still required, so a consumer that stops sending it fails validation and the
  two paths never coexist. Mark and `.optional()` land together.
- **A schema is two surfaces.** It validates at runtime *and* produces an
  exported type through `z.infer`. The marker covers both; the removal breaks
  both, at different times — the type at the consumer's next build, the validator
  at the next request.

`Finding` and `Review` are also fed to the model as structured output. A field
marked there is still described to the LLM until it is removed, so keep the
`.describe()` text accurate for as long as the field exists.

---

## HTTP routes and response fields

A JSDoc tag never reaches a browser. Headers do.

```ts
app.get('/settings/secrets-status', { schema: { params: IdParams } }, async (req, reply) => {
  reply.header('Deprecation', '@1793491199');
  reply.header('Sunset', 'Wed, 04 Nov 2026 23:59:59 GMT');
  reply.header('Link', '</server/specs/2026-08-06-secrets-status.md>; rel="deprecation"');
  return secretsStatus(req);
});
```

- `Deprecation` (RFC 9745) — when it *became* deprecated.
- `Sunset` (RFC 8594) — when it stops answering. Never earlier than `Deprecation`.
- `Link` with `rel="deprecation"` — the same escape route `@migration` names.

Headers go on the **old** route only. Putting them on the replacement announces
the thing you just asked everyone to move to.

**A deprecated response field** cannot carry its own header, so the route carries
it and the field carries a JSDoc marker in the contract. Keep populating the old
field for the whole window; a field that is present but always `null` is a
removal wearing a marker.

Finding the callers is a string search, because nothing types a URL:

```bash
rg -n 'secrets-status' client/src e2e
```

---

## React props

`client/src/vendor/ui/primitives/*.tsx` and `client/src/components/**`. Props are
declared inline in the component's parameter type here, and that is where the
marker goes.

```tsx
export function Badge({
  children,
  color = "var(--text-secondary)",
  tone,
  ...
}: {
  children?: React.ReactNode;
  /**
   * @deprecated since 0.5.0 — use `tone`, which maps to the SEV/CAT tokens
   * @removeAfter 0.7.0 2026-11-04
   * @migration client/specs/2026-08-06-badge-tone.md
   */
  color?: string;
  tone?: BadgeTone;
}) {
```

The component keeps honouring `color` for the whole window, and the new prop wins
when both are passed. A dev-only warning catches the call sites that a grep over
a dynamic prop spread would miss:

```tsx
if (process.env.NODE_ENV !== "production" && color !== undefined) {
  console.warn("Badge: `color` is deprecated, use `tone` (removed after 2026-11-04)");
}
```

Never in production. A warning that ships to users is a bug report about your
own refactor.

---

## Env vars

`server/src/platform/config.ts` holds the single Zod `EnvSchema`. An env var is
consumed by deployments and `.env` files, which fail at **boot** — so the failure
looks like an outage rather than a version problem, and the announcement has to
be visible in logs.

```ts
const EnvSchema = z.object({
  /**
   * @deprecated since 0.5.0 — use `DEVDIGEST_WORKSPACE_DIR`
   * @removeAfter 0.7.0 2026-11-04
   * @migration server/specs/2026-08-06-workspace-dir.md
   */
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  DEVDIGEST_WORKSPACE_DIR: z.string().optional(),
});
```

Read the new name, fall back to the old, and say so once at startup:

```ts
if (env.DEVDIGEST_CLONE_DIR && !env.DEVDIGEST_WORKSPACE_DIR) {
  logger.warn('DEVDIGEST_CLONE_DIR is deprecated; use DEVDIGEST_WORKSPACE_DIR (removed after 2026-11-04)');
}
```

Renaming an env var *without* reading the old name is a MAJOR that takes down
every existing deployment. Reading both makes it a MINOR. That is the entire
difference, and it costs three lines.

Update `.env.example` in the same commit — it is the only documentation most
people read.

Secrets are the exception to the location, not to the policy: they never enter
`EnvSchema` at all and reach code through `SecretsProvider`. Deprecating a secret
key means marking it in the provider, with the same three fields.

---

## Feature flags

`EMBEDDINGS_ENABLED` and `REPO_INTEL_ENABLED` are env-driven flags in the same
schema, and retiring one has a shape env vars do not: the flag does not just
disappear, **its value becomes permanent**.

Three steps, and the middle one is the one people skip:

1. **Decide the winner.** The flag's default becomes the only behaviour.
2. **Make the flag a no-op, keep reading it, and warn when it disagrees.** An
   operator who set `REPO_INTEL_ENABLED=false` deliberately must find out that it
   stopped taking effect — silently ignoring it is worse than removing it.
   ```ts
   if (env.REPO_INTEL_ENABLED === 'false') {
     logger.warn('REPO_INTEL_ENABLED is deprecated and no longer honoured; repo-intel is always on (key removed after 2026-11-04)');
   }
   ```
3. **Remove the key** after the window, and delete the dead branch with it.

Removing the flag and the losing branch in one commit skips step 2 and turns a
deliberate operator choice into an unexplained behaviour change.

---

## A whole module

`server/src/modules/<name>/` is a Fastify plugin registered statically in
`modules/index.ts`. It is not one surface — it is every route it registers plus
every symbol it exports.

Mark the **entry points**, not the internals:

```ts
/**
 * @deprecated since 0.5.0 — use the `brief` module; this one predates SmartDiff
 * @removeAfter 0.7.0 2026-11-04
 * @migration server/specs/2026-08-06-legacy-brief-retirement.md
 */
export default async function legacyBriefRoutes(app: FastifyInstance) {
```

- the plugin function gets the JSDoc marker;
- **each route** it registers gets the `Deprecation` / `Sunset` / `Link` headers,
  because a client calling one endpoint never sees a marker on the module;
- internals get nothing. They were never reachable, and marking them teaches
  people that markers are decoration.

Deregistering from `modules/index.ts` is the **removal**, not the announcement.
Until the window closes the module stays registered and answering, because a
module that is present but unregistered is a 404 with extra steps.

The equivalent on the client is a route folder under `client/src/app/`: mark the
page's exported component, keep the route resolving, and redirect rather than
delete.

## What has no marker at all

**Database columns.** There is nowhere on a column to hang JSDoc, and this skill
does not cover schema or migrations. A column is announced structurally — the new
column exists beside the old one and the gap between the two migration numbers is
the window. That is `breaking-change`'s `references/database.md`.
