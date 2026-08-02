# Examples

Good/bad pairs. The "good" side is drawn from `client/` where possible, so these
double as a map of what the codebase already does.

## Placing a new component

A filter bar used only by the pull list.

```
❌ src/components/FilterBar.tsx
   "it's a component, components go in components/"

✅ src/app/repos/[repoId]/pulls/_components/FilterBar/
     FilterBar.tsx  constants.ts  styles.ts  index.ts
```

One caller, one route → it lives with that route. If the agents page later needs
the same bar, *then* move it to `src/components/filter-bar/` — the move is a
five-minute change, and by then you know what both callers actually need.

## Naming a shared module

```
❌ src/lib/utils.ts
     export function parseSeverity(...)
     export function costOfRun(...)
     export function pullUrl(...)

✅ src/lib/severity.ts      parseSeverity, sortBySeverity, countActiveBySeverity
   src/lib/cost.ts          costOfRun
   src/lib/github-urls.ts   pullUrl
```

This is the actual layout of `client/src/lib/`. Each module has an obvious
answer to "does this function belong here"; `utils.ts` never does.

## Function or hook

```ts
❌ export function useSeverityRank(severity: string) {
     return SEVERITIES.indexOf(severity);
   }

✅ export function severityRank(severity: string): number {
     const i = (SEVERITIES as readonly string[]).indexOf(severity);
     return i === -1 ? SEVERITIES.length : i;
   }
```

The real one is in `client/src/lib/severity.ts`. It calls no hook, so it is a
plain function — callable from a sort comparator, a test, or a loop, none of
which a hook allows.

## Logic in JSX vs a named domain function

```tsx
❌ <Badge>{findings.filter(f => !f.dismissed_at && f.severity === "CRITICAL").length}</Badge>

✅ const counts = countActiveBySeverity(findings);
   <Badge>{counts.CRITICAL}</Badge>
```

The filter predicate is a domain rule — "dismissed findings do not count". Inline,
it is invisible to search and duplicated the next time someone needs a count.
`countActiveBySeverity` in `client/src/lib/severity.ts` is greppable, tested in
`severity.test.ts`, and has exactly one definition of "active".

## Fetching

```tsx
❌ function PullList({ repoId }) {
     const [pulls, setPulls] = useState([]);
     useEffect(() => {
       fetch(`${base}/repos/${repoId}/pulls`).then(r => r.json()).then(setPulls);
     }, [repoId]);
   }

✅ function PullList({ repoId }) {
     const { data: pulls, isLoading } = usePulls(repoId);
   }
```

`usePulls` lives in `client/src/lib/hooks/core.ts` and goes through
`src/lib/api.ts`. The bad version also copies server state into `useState`,
which opts out of background refetching, and has no request cleanup, so a fast
repo switch can land the wrong response.

## One source of truth for tokens

```ts
❌ // FindingsSection/constants.ts
   const SEV_COLOR = { CRITICAL: "#e5484d", WARNING: "#f5a524", SUGGESTION: "#3e63dd" };

✅ import { SEV } from "@devdigest/ui";
```

This is a real defect in this repo, recorded in `client/INSIGHTS.md`: two
hand-rolled `SEV_COLOR` copies exist and one has already drifted from
`src/vendor/ui/primitives/tokens.ts`. Do not add a third — when you touch a file
that has one, replace it.

Related trap in the same area: `@devdigest/ui` exports a four-value `Severity`
(it adds `INFO`) while `@devdigest/shared` exports the three-value contract enum.
Build `Record<Severity, number>` off the shared one; import `SEV` from the UI one.

## Constants

```
❌ src/constants/index.ts
     export const PAGE_SIZE = 25;
     export const MODEL_COLOR = {...};
     export const SEVERITIES = [...];

✅ app/repos/[repoId]/pulls/constants.ts        PAGE_SIZE
   _components/AgentCard/constants.ts           MODEL_COLOR
   src/lib/severity.ts                          SEVERITIES
```

Three values with three different owners. `SEVERITIES` earns a shared home
because it is genuinely used across features; the other two do not.

## Splitting a component

```tsx
❌ // RunTraceDrawer.tsx, 480 lines
   // fetches the trace, formats prompts, renders tool calls, renders findings,
   // owns the modal, owns the copy-to-clipboard toast

✅ RunTraceDrawer/
     RunTraceDrawer.tsx        owns the drawer shell and open/close
     _components/TraceBody/    owns the trace rendering
     _components/PromptBlock/  owns prompt display
     _components/ToolCallRow/  owns one tool call
     _components/FindingsSection/
```

This is the real layout. The split was not driven by line count — each sentence
in the "❌" comment is a separate responsibility, and each became a folder.

## Prop drilling

```tsx
❌ <PrDetailHeader repo={repo} pull={pull} findings={findings} onDismiss={...} />
   //  → passes findings and onDismiss down two more levels untouched

✅ <PrDetailHeader repo={repo} pull={pull}>
     <FindingsPanel findings={findings} onDismiss={onDismiss} />
   </PrDetailHeader>
```

The header never needed findings. Passing JSX as `children` sends the data
straight to the component that uses it, and the header stops needing to change
when the findings API changes.

## Boolean props

```tsx
❌ <Badge critical warning suggestion />
✅ <Badge severity="CRITICAL" />
```

Three booleans allow eight combinations, five of which are meaningless. One
prop typed as the `Severity` union allows exactly the three that exist.

## Styles

```tsx
❌ <div style={{ display: "flex", gap: 8, borderColor: active ? "#fff" : "#333" }}>

✅ // styles.ts
   export const s = {
     row: (active: boolean) => ({ display: "flex", gap: 8, ... }),
   };
   // Component.tsx
   <div style={s.row(active)}>
```

Inline style objects in a colocated `styles.ts` are this repo's deliberate
convention. Note the trap from `client/INSIGHTS.md`: in a stateful style
function, never mix a CSS shorthand with its longhand when the value changes
with state — `borderColor`/`borderWidth`/`borderStyle` are themselves shorthands,
so keep every border declaration at one level.

## Strings

```tsx
❌ <button aria-label="Dismiss finding">✕</button>
✅ <button aria-label={t("findings.dismiss")}>✕</button>
```

`aria-label` is user-facing text and goes through next-intl like any other
string. Icon-only buttons are the most commonly missed case — both for
translation and for accessibility.
