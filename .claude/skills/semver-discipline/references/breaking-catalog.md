# Breaking-change catalog

Change-by-change classification per surface. Use this when the default-answers
table in `SKILL.md` did not settle it, or when you need to justify a verdict with
something more specific than "it's a rename".

The levels assume a `1.x` package with real consumers. For `0.x`, pre-release and
unpublished packages see `edge-cases.md` — the classification does not change,
only the number it maps onto.

**Contents**

- [Zod contracts](#zod-contracts)
- [HTTP API](#http-api)
- [Package exports and function signatures](#package-exports-and-function-signatures)
- [TypeScript types](#typescript-types)
- [Database schema](#database-schema)
- [Configuration and environment](#configuration-and-environment)
- [The direction rule](#the-direction-rule)

---

## Zod contracts

A schema is usually two surfaces at once: a runtime validator and, through
`z.infer`, an exported type. Classify both — they fail differently and at
different times.

| Change | Level | Why |
|---|---|---|
| Add optional field / field with `.default()` | MINOR | Old payloads still parse |
| Add required field to a **request** schema | MAJOR | Every existing caller is now invalid |
| Add field to a **response** schema (`z.object`) | MINOR | Unknown keys are stripped; consumers ignore extras |
| Add field to a response schema under `.strict()` | MAJOR | `.strict()` turns the extra key into a parse error |
| Remove a field | MAJOR | Reads break; the inferred type loses a property |
| Rename a field | MAJOR | Removal + addition |
| Optional → required | MAJOR | Previously valid input is rejected |
| Required → optional, **request** | MINOR | Callers may keep sending it |
| Required → optional, **response** | MAJOR | Consumers must now handle `undefined` |
| Add `.nullable()` to a response field | MAJOR | Same reason — a new state the consumer never handled |
| Remove `.nullable()` from a request field | MAJOR | `null` was accepted, now it is not |
| Tighten a rule (`.min`, `.max`, `.email`, `.regex`, `.int`) | MAJOR | Data that passed yesterday fails today |
| Loosen a rule | MINOR | Strictly more input is accepted |
| Change a `.default()` value | MAJOR | Silent behaviour change for anyone who omits the field |
| Add enum value, **request** | MINOR | Old callers unaffected |
| Add enum value, **response** | MAJOR | Exhaustive `switch`/match on the union now falls through |
| Remove enum value | MAJOR | Both directions |
| Change a field's type (`string` → `number`) | MAJOR | Even when the JSON looks similar |
| `z.object` → `z.strictObject` | MAJOR | Rejects payloads that previously parsed |
| Change `.describe()` / comments | PATCH | Not observable — unless the description is fed to an LLM as part of a prompt, in which case it is a behaviour change |
| Split one schema into two, re-exporting the same name and shape | PATCH | Nothing observable moved |

**Good / bad**

```ts
// ❌ MINOR — "additive"
export const CreateReviewRequest = z.object({
  pr_id: z.string(),
  agent_ids: z.array(z.string()),
  grounding_mode: z.enum(['strict', 'loose']),   // required: every caller breaks
});

// ✅ MINOR — genuinely additive
export const CreateReviewRequest = z.object({
  pr_id: z.string(),
  agent_ids: z.array(z.string()),
  grounding_mode: z.enum(['strict', 'loose']).default('strict'),
});
```

---

## HTTP API

The consumer here is a deployed client that you do not get to recompile. Assume
an old client and a new server run at the same time during any rollout.

| Change | Level | Why |
|---|---|---|
| Add a new route | MINOR | Nothing existing changes |
| Remove a route | MAJOR | |
| Change a path or a path parameter's meaning | MAJOR | Including `/pulls/:id` where `id` changes from row id to external id |
| Change the HTTP method of an existing operation | MAJOR | |
| Add an optional query parameter | MINOR | |
| Add a required query parameter or body field | MAJOR | |
| Remove or rename a response field | MAJOR | |
| Add a response field | MINOR | |
| Change a success status code (`200` → `201`, `200` → `202`) | MAJOR | Clients branch on status; `202` also changes the timing contract |
| Change an error status (`404` → `422`) | MAJOR | |
| Change the error body shape or an error `code` string | MAJOR | If anything branches on it. If nothing does, PATCH — verify by grepping the client |
| Add a new error code that a new input can produce | MINOR | Old inputs cannot reach it |
| Add a new error code an **existing** input can now produce | MAJOR | New failure mode on an unchanged call |
| Sync → async (returns a job id instead of the result) | MAJOR | The largest possible break in the smallest possible diff |
| Add pagination to a list endpoint that returned everything | MAJOR | Consumers silently receive a truncated list |
| Change ordering of a list where none was documented | MINOR | Document the order; consumers that relied on it were guessing |
| Add or tighten rate limiting / auth on an existing route | MAJOR | Working calls start failing |
| Change SSE / stream event names or payloads | MAJOR | Same rules as response bodies |
| Add a new SSE event type | MINOR | Unless consumers exhaustively match event names |

**Good / bad**

```
❌ MINOR — "the response is still a list, just wrapped"
GET /repos/:id/pulls  →  { items: [...], next_cursor: "..." }   // was: [...]

✅ MAJOR, or add it as a new shape behind an opt-in parameter:
GET /repos/:id/pulls?page_size=50  →  { items, next_cursor }
GET /repos/:id/pulls               →  [...]                     // unchanged
```

---

## Package exports and function signatures

| Change | Level | Why |
|---|---|---|
| Add a new export | MINOR | |
| Remove or rename an export | MAJOR | Including removing it from a barrel while the file keeps it |
| Add an optional parameter at the end | MINOR | |
| Add a required parameter | MAJOR | |
| Reorder parameters | MAJOR | Even when the types make it a compile error — *especially* then |
| Widen a parameter type (`string` → `string \| number`) | MINOR | Every existing call is still valid |
| Narrow a parameter type | MAJOR | |
| Widen a return type | MAJOR | The consumer must now handle more cases |
| Narrow a return type | MINOR | The consumer's existing handling still covers it |
| Sync → returns a `Promise` | MAJOR | |
| Throw a new error type from an existing path | MAJOR | |
| Stop throwing / return `null` instead | MAJOR | `catch` blocks stop firing; nothing warns you |
| Change a default option value | MAJOR | |
| Add a new option with a default that preserves old behaviour | MINOR | This is the additive alternative to the row above |
| Move a file without changing its export path | PATCH | |
| Change a deep import path (`pkg/dist/x`) | MAJOR | If it was reachable, it was public, `dist` or not |
| Performance, logging, internal rewrite with identical behaviour | PATCH | |

---

## TypeScript types

Type-level breaks fail at build time in *someone else's* repo, which is the
worst place to discover them.

| Change | Level | Why |
|---|---|---|
| Add an optional property to an exported interface | MINOR | |
| Add a required property to a type consumers **construct** | MAJOR | Their object literals no longer satisfy it |
| Add a property to a type consumers only **read** | MINOR | |
| Add a member to a union that appears in a return type | MAJOR | Exhaustive checks fail |
| Remove a member from a union | MAJOR | Consumers may pass or match it |
| Turn a concrete type into a generic with a default | MINOR | `Foo` still resolves |
| Add a required generic parameter | MAJOR | |
| Widen `string` → `string \| null` anywhere it is read | MAJOR | |
| Rename an exported type alias | MAJOR | Even when the shape is identical |
| Make a property `readonly` | MAJOR | Writers stop compiling |

Same construct-vs-read asymmetry as request-vs-response, for the same reason: a
type used as input tolerates loosening, a type used as output tolerates
tightening.

---

## Database schema

The consumer is every row already written and every process currently running.
Rollouts are not atomic — old code and the new schema coexist for a window.

| Change | Level | Why |
|---|---|---|
| Add a nullable column | MINOR | Old inserts still work |
| Add a column with a default | MINOR | |
| Add a `NOT NULL` column with no default | MAJOR | Existing inserts fail; the migration fails on a non-empty table |
| Drop a column | MAJOR | And irreversible — the data is gone |
| Rename a column or table | MAJOR | Use expand-and-contract instead |
| Narrow a type (`text` → `varchar(50)`, `bigint` → `int`) | MAJOR | Existing rows may not fit |
| Widen a type | MINOR | |
| Add a `CHECK` / unique constraint | MAJOR | Fails if existing rows violate it, and rejects previously valid writes |
| Drop a constraint | MINOR | |
| Add an index | PATCH | Use `CONCURRENTLY` on a live table |
| Change an enum's values | MAJOR | Postgres enums cannot drop values without a rewrite |
| Backfill data without changing the schema | PATCH | Unless something reads the old values |

**Expand and contract** — how a MAJOR becomes three MINORs:

```
1. MINOR  add `rejected_at` (nullable), write to both columns
2. MINOR  backfill; switch all reads to `rejected_at`; deprecate `dismissed_at`
3. MAJOR  drop `dismissed_at`  ← only now, and only once nothing reads it
```

Each step is independently deployable and independently revertible. That is the
whole point: the MAJOR at the end is cheap because nothing depends on it any more.

---

## Configuration and environment

Consumers here are deployments, `.env` files, and CI. They fail at boot, which
looks like an outage rather than a version problem.

| Change | Level | Why |
|---|---|---|
| Add an optional env var with a default | MINOR | |
| Add a required env var | MAJOR | Every existing deployment fails to boot |
| Rename an env var | MAJOR | Unless the old name is still read with a deprecation warning — then MINOR |
| Change a default value | MAJOR | |
| Remove support for a config key | MAJOR | |
| Raise a minimum runtime version (Node, Postgres) | MAJOR | |
| Add a new optional CLI flag | MINOR | |
| Change a flag's short form or default | MAJOR | |
| Change a file path the tool reads or writes | MAJOR | |

---

## The direction rule

Most of the tables above are one rule wearing different clothes:

> **Loosen what you accept — MINOR. Loosen what you promise — MAJOR.**
> Tighten what you accept — MAJOR. Tighten what you promise — MINOR.

| Surface | "Accept" | "Promise" |
|---|---|---|
| Zod | request schema | response schema |
| Function | parameters | return type |
| HTTP | body, query, params | status, body, headers |
| Types | constructed by consumer | read by consumer |
| Database | what a write may contain | what a read will contain |

When a change resists classification, find which column it sits in and which
direction it moves. That answers it more reliably than pattern-matching against
a table row.
