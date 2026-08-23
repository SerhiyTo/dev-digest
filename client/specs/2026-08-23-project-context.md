# Spec: Project Context (client)

Three surfaces, one feature: a **Project Context page** that lists and previews
every markdown document in a repository's clone, a **Context tab** on both the
agent and the skill editor that attaches documents in a chosen order with a
token-cost footer, and a **run-trace segment** that shows the literal text a
finished run injected.

The server half — discovery, the attachment tables, assembly, injection and the
reasoning behind each — is `server/specs/2026-08-23-project-context.md`. This
document covers only what the browser does. `specs/2026-08-20-project-context.md`
(SPEC-01) is the source of truth for *what* the product must do.

## What already existed and was wired to nothing

- `SpecFile` / `IndexStatus` in `vendor/shared/contracts/platform.ts`, and
  `useContextFiles` / `useReindexContext` in `lib/hooks/core.ts` — hooks against
  a contract no page called, pointing at `/context` and `/context/reindex`.
- A complete `messages/en/context.json` namespace, including `mode.edit` and
  `editor.save` from the **rejected** in-app editor (`UX-1`).
- `TraceBody`'s `Specs read` row and its `specs` prompt segment
  (`app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:39-51`),
  which had always rendered `trace.specs_read` and `prompt_assembly.specs` —
  and had always been handed `[]` and `null`.

The dormant hooks were **deleted, not extended** (`lib/hooks/core.ts`): `SpecFile`
cannot carry `omitted` or `used_by_agents`, so a second hook file
(`lib/hooks/context.ts`) supersedes them and the server-side `SpecFile` carries
a `@deprecated` marker instead of a deletion. `mode.edit` and `editor.save` were
pruned so the message file stops advertising a feature that was rejected.

`TraceBody.tsx` itself was **not touched**. The only change on that surface is
one string: `runs.json`'s `promptAssembly.specs` label became
`Project context — attached specs (untrusted)`, which is what AC-45 asks for.
The segment appearing at all is a consequence of the server finally sending
something.

## Navigation

`/repos/:repoId/context`, registered in `vendor/ui/nav.ts` as a `NavItemDef`
with the `FileText` icon and the `g d` shortcut, plus the matching `ShortcutDef`
in `SHORTCUTS`. **Sidebar entries live in `nav.ts`, not in the App Router** — a
page that only exists under `app/` is unreachable from the shell. `vendor/ui/`
is otherwise treated as read-only; this is a deliberate, minimal exception, as
is the `Markdown` primitive below.

The page itself is a three-line client component that reads `repoId` from
`useParams` and delegates (`app/repos/[repoId]/context/page.tsx`). Everything
else is in `_components/ProjectContextView/`.

## Data layer

`lib/hooks/context.ts` is the whole API surface, one hook per route, with
exported key factories so tests and mutations can address the same cache
entries:

| Hook | Route |
|---|---|
| `useProjectDocs(repoId)` | `GET /repos/:id/context` |
| `useResyncProjectContext(repoId)` | `POST /repos/:id/context/resync` |
| `useProjectDoc(repoId, path)` | `GET /repos/:id/context/file?path=` |
| `useDocAttachments(kind, ownerId)` | `GET /(agents\|skills)/:id/context` |
| `useSetDocAttachments(kind, ownerId)` | `PUT /(agents\|skills)/:id/context` |
| `useTokenEstimate(repoId, paths)` | `POST /repos/:id/context/estimate` |

Three choices in there are load-bearing.

**`useResyncProjectContext` writes the response into the cache with
`setQueryData`, not `invalidateQueries`** (`hooks/context.ts:53-56`). The resync
route returns a complete `ProjectDocList`, so the refreshed list is already in
hand; invalidating would cost a second round-trip and briefly show the stale
list. This is only safe because the route returns the list — had it returned a
bare timestamp, the same call would have written a timestamp over the documents.

**`useSetDocAttachments` writes its own response and invalidates
`["project-docs"]`** (`hooks/context.ts:91-94`). The attachment response is
authoritative for the panel, but the *document list* carries `used_by_agents`,
which the mutation has just changed for a document the user may be looking at on
another page. Invalidating by the key prefix rather than by `repoId` is
deliberate: an attachment can affect the reverse lookup for any repository.

**`useProjectDoc` sets `retry: false`.** An unreadable or missing document is a
404 with a meaning — the preview renders *that reason*. Retrying three times
would delay a correct error message and hammer a file the server has already
said it cannot read.

## The attach panel is shared, and lives outside both editors

`components/doc-attach/` holds `DocAttachPanel` plus its `helpers.ts`,
`constants.ts` and `styles.ts`. The agent and skill Context tabs are each a
~40-line adapter that resolves `next-intl` strings from their **own** namespace
and passes them down as a `DocAttachLabels` object
(`app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx`,
and the skill twin).

**Why labels are injected rather than read inside the panel.** A component under
`components/` is not owned by any route, so it must not reach into a route's
message namespace. `agents.context.*` and `skills.context.*` stay separate files
that can diverge in wording — the skill tab says "skill", the agent tab says
"agent" — while the behaviour has exactly one implementation. The interface
`DocAttachLabels` is what makes an omission a **type error** rather than a
`MISSING_MESSAGE` at runtime, and one test asserts each namespace supplies every
key.

**Why not two panels.** AC-20 requires the skill tab to offer the same list,
the same ordering control and the same preview as the agent tab. Two
implementations would have satisfied that on the day they were written and
drifted afterwards; a test asserts the two tabs render the same rows, the same
ordering controls and the same estimate footer.

The tab is registered in each editor's `constants.ts` `TABS` array and in the
page's `VALID_TABS` guard — **both**, or `?tab=context` deep-links back to
Config. The agent editor's body switch was rewritten from a ternary to explicit
`tab === …` clauses so a third tab does not silently fall through to `ConfigTab`.

## Attach, detach and reorder are one operation

Every mutation sends the **whole ordered path list** with a `PUT`
(`DocAttachPanel.tsx:138-155`), following the `useSetAgentSkills` idiom already
in the codebase. Attaching appends, detaching filters, reordering splices, and
the server replaces the rows in one transaction. There is no partial-reorder
state to reconcile and no per-row endpoint to keep consistent.

Ordering is offered twice on purpose: **drag-and-drop** for a mouse and **up/down
`IconBtn`s labelled with the row's path** for a keyboard and a screen reader.
Drag-and-drop alone would have made ordering — which changes what the model
reads first — mouse-only.

**An attachment the document list does not contain is kept and rendered, never
dropped.** `attachedRows` falls back to deriving a name and folder from the path
itself and marks the row `missing` (`helpers.ts:40-51`). This is the client half
of the server's "an attachment is a path, not a link to a repository" decision:
the row can be reordered and detached like any other, and the badge reads **"not
in this repo"**, not "deleted". The tooltip enumerates the possibilities the page
genuinely cannot distinguish — a different repository, a deletion, a rename, or
a document beyond the discovery cap — rather than asserting one. Wording that
claims more than the data supports is the failure mode here, and it is tested:
*"words an unlisted attachment as absent from this repository, not as deleted"*.

## The estimate footer

The footer prices the **assembled block**, not the files: the panel debounces
the attached paths for 250 ms, slices them to `MAX_ATTACHMENTS`, and asks the
server (`DocAttachPanel.tsx:54-64,88-89`). Reordering, attaching and detaching
in quick succession therefore costs one request, not one per click, and the
client never asks the server to price more documents than a run would use.

`MAX_ATTACHMENTS` is **not redeclared here**. `components/doc-attach/constants.ts:12`
re-exports it from `@devdigest/shared`, whose `contracts/context.ts:55` is the
single definition and is byte-identical across the two vendored copies
(gated by `scripts/verify-l04.sh`). The at-limit block, the "Limit reached"
string and the estimate slice therefore cannot drift from the server's 409.

The number is always worded as an estimate — `≈{tokens} tokens per run — an
estimate, not an exact count` — because the server may have priced it with the
`ceil(chars/4)` fallback rather than `cl100k_base`, and a precise-looking number
would be a claim the system cannot make. A failed estimate degrades to "Token
estimate unavailable" and **leaves the rows editable**; the cost readout is
informative, never a gate.

## Loading and failure states

`DocAttachPanel` renders **no editable row** until *both* the documents and the
attachments have resolved, and renders a retryable `ErrorState` if either fails
(`DocAttachPanel.tsx:103-127`). The reason is in the shipped string: saving from
a half-loaded panel would `PUT` an incomplete list and **overwrite the
attachments that failed to load**. A skeleton here is a data-integrity measure,
not a nicety.

Save failures are mapped from the API error code to a specific sentence rather
than surfacing a raw message (`helpers.ts:69-89`):

| Code | Wording |
|---|---|
| `conflict` | "an agent or skill may attach at most {max} documents" |
| `invalid_path` | "one of those paths is not a project document path" |
| `not_found` | "this agent or skill no longer exists. Reload the page." |
| `internal_error` | "the server could not complete the change. Try again." |
| anything else | the server's own message, verbatim |

Every one of them starts "Not saved — ", and the rows stay editable, because the
optimistic-looking checkbox state is *not* what was persisted.

## The page: selection lives in the URL

`ProjectContextView` keeps the selected document in `?path=` via
`router.replace`, not in component state
(`ProjectContextView.tsx:28-34`). A reload, a shared link or a back navigation
restores the same preview — the state that matters to another human is in the
address bar. Two tests pin both directions.

Four states, each named rather than empty:

- **not cloned** — `reason === 'not_cloned'` from the server, which is derived
  from `repos.clone_path` and not from an empty walk; the copy says documents
  are read from the clone's default branch and asks the user to clone or
  refresh;
- **cloned, no documents** — names all four scanned roots (`SCANNED_ROOTS`,
  `constants.ts:5`) so the user knows where to put a file;
- **load failure** — retryable `ErrorState`, never an empty list;
- **documents** — a category-grouped list beside a preview pane.

The subtitle reports the discovered count and appends the server's `omitted`
count when the discovery cap fired, so a truncated list never looks complete.
`used_by_agents` is rendered as a badge per row with the agent names in the
`title`, which is the reverse lookup that makes "who reads this document?"
answerable from the document's side.

> The last-refreshed line will read "0 seconds ago" on every load, because the
> server generates `last_synced_at` during the walk it performs for each read.
> The `neverSynced` string is therefore unreachable for a cloned repository. It
> is kept for the day the timestamp is persisted.

## Rendering an untrusted document safely

The preview renders repository-controlled markdown, so the `Markdown` primitive
was hardened rather than bypassed (`vendor/ui/primitives/Markdown.tsx`):

- **Raw HTML stays off.** `react-markdown` does not render embedded HTML unless
  `rehype-raw` is added; it is not added, and it must not be. A `<script>` in a
  document is text.
- **A URL scheme allowlist is opt-in per call site.** `urlTransformFor` composes
  `defaultUrlTransform` with an explicit allowlist and returns `""` for anything
  else, so a `javascript:` or `data:` href is dropped rather than rendered
  (`Markdown.tsx:7-33`). The preview passes `PREVIEW_URL_SCHEMES = ["http",
  "https"]`; every other call site passes nothing and keeps the previous
  behaviour. The transform is memoised per scheme list so a new function
  identity is not handed to `ReactMarkdown` on every render.
- The renderer gained headings, lists, blockquotes, tables and fenced code
  blocks, because a document preview that renders a spec's tables as one long
  paragraph is not a preview. `BlockCodeContext` is what lets `code` style
  itself differently inside a `pre` without a second component.

The hostile-document test asserts the *absence* of a `script` element and of a
`javascript:` href, which is the only assertion that stays honest as the
renderer grows.

## Preview failure wording

`DocumentPreview` maps the server's 404 codes to distinct sentences
(`_components/DocumentPreview/constants.ts`):

- `not_found` — the file is gone from the clone; **tells the user to resync**;
- `document_unreadable` — the file is listed but could not be read; **does not**
  tell the user to resync, because resyncing will list it again;
- `not_cloned` — the repository has no clone, so no file is to blame.

That three-way split is the entire payoff of the server's discriminated read
result, and two tests exist specifically to keep the resync advice attached to
the one case it helps.

A truncated body is announced above the text ("the preview shows only its first
part") on `ProjectDocBody.truncated`, so a large document never looks like it
simply ends.

## Client tests

- `components/doc-attach/DocAttachPanel.test.tsx` — 24 cases: ordering and the
  attached/total badge; attach and detach both `PUT` the whole ordered list;
  keyboard reorder including the no-op at each end; drag reorder; a missing
  attachment kept, reorderable, detachable and worded as absent-from-this-repo;
  the estimate never exceeding the attachment limit; the at-limit block; the
  unavailable-estimate degradation; the debounce; filtering that never truncates
  what is sent; no editable row while either query is unresolved or failed; and
  all five save-error mappings. Two further cases assert every namespace ships
  every label, and that the shipped footer is worded as an estimate.
- `app/agents/[id]/…/ContextTab/ContextTab.test.tsx` — 11 cases: the agent
  endpoint and the active repository; the shipped `agents.context.*` strings
  around the shared panel; ordered rows with a reorder control; the scope note;
  the unlisted-versus-deleted wording; every save-error string; and the no-repo
  state.
- `app/skills/[id]/…/ContextTab/ContextTab.test.tsx` — 4 cases: the skill
  endpoint, a reorder through the skill's own mutation, the no-repo state, and
  the equivalence case asserting the two tabs present the same surface.
- `app/repos/[repoId]/context/…/ProjectContextView.test.tsx` — 6 cases: the
  not-cloned state, the four-roots empty state, the category-grouped list with
  the used-by badge and refresh time, `?path=` written on selection, `?path=`
  restored on mount, and a retryable error instead of an empty list.
- `…/DocumentPreview/DocumentPreview.test.tsx` — 9 cases: a hostile document
  renders inert; truncation announced and not announced; the three distinct 404
  reasons (including *not* advising resync for an unreadable file); an
  unrecognised code; a non-API failure; and the no-selection placeholder.
- `…/RunTraceDrawer/…/TraceBody.test.tsx` — 4 cases: the segment labelled as
  untrusted attached specs showing the block as sent; copy and fullscreen on it;
  `Specs read` listing the injected paths in injection order; and the segment
  omitted with the none-state shown when nothing was injected.

All of these use `fireEvent.click`; **never `element.click()`**, which does not
go through React's synthetic event system in this setup.

## Out of scope

Authoring or editing a document in the browser — `UX-1` was rejected in SPEC-01,
and this change *removes* the two leftover strings that implied it. The
`COVERAGE` gauge (`UX-2`), the `Indexed: N files · N chunks` footer (`UX-3`) and
per-row token estimates (`UX-5`), all SPEC-01 non-goals.

Deciding what an attachment means when the active repository changes: the panel
words the case, it does not resolve it. Rendering
`prompt_assembly.pr_description` and `prompt_assembly.intent`, which the trace
contract declares and no component renders. Localising into a second language —
only `messages/en/` exists. Restoring the deleted `useContextFiles` /
`useReindexContext` hooks or rendering `SpecFile` anywhere; the marker on the
server contract opens its removal window and the deletion is a later change.
