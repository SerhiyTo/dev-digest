# Utils, types, barrels and file naming

## `utils.ts` is not a location

`utils`, `helpers`, `common`, `misc` describe the *shape* of the contents — "a
function, smallish, shared" — and say nothing about purpose. A folder with no
purpose has no admission criteria, so nothing is ever rejected from it, and it
grows until it is a pile of unrelated functions that everything imports and
nobody owns.

The fix is not a rule about size. **Name the module after its domain.**

```
❌ lib/utils.ts        formatDate, parseSeverity, buildGithubUrl, clamp, slugify
✅ lib/severity.ts     parseSeverity, sortBySeverity, countActiveBySeverity
✅ lib/cost.ts         costOfRun, formatCost
✅ lib/github-urls.ts  pullUrl, fileUrl, commitUrl
```

`client/src/lib/` already does this — there is no `utils.ts` in it, and that is
deliberate. A named module has an obvious answer to "does this function belong
here", it can be tested and deleted as a unit, and it tells you at the import
site what kind of code you are pulling in.

**Per-component `helpers.ts` is a different thing and is fine.** It is scoped by
the folder it sits in, private behind that folder's `index.ts`, and cannot
accumulate unrelated code because it is not importable from elsewhere. The
anti-pattern is the *global* dumping ground, not the local helper file.

When a helper starts being needed elsewhere, that is the signal to give it a
domain name and promote it — not to create `lib/utils.ts` for it.

## Where types go

Same ladder as everything else, promoted only on demand:

1. **Inline in the file that uses it** — props types, local shapes. Most types
   stop here and should.
2. **A colocated `types.ts`** in the component or feature folder, once several
   files in that folder share it.
3. **A shared module** when unrelated features need it.
4. **A contracts package** when the type crosses a real boundary (client/server).

A single global `types.ts` is the type-level version of `utils.ts`: it hides the
relationship between a type and its context, and it grows without limit.

Conventions:

- `.ts` for types you import explicitly. `.d.ts` **only** for ambient
  declarations — env typing, module augmentation for a third-party package.
- Infer from schemas rather than maintaining a parallel interface:
  `type Settings = z.infer<typeof settingsSchema>`. Two hand-maintained
  definitions of the same shape will drift.
- No `IUser` prefixes, no `UserType` suffixes. `User` is the name.
- Use `export type { X }` when re-exporting a type, so the re-export erases at
  build time.

## Barrel files

A barrel is an `index.ts` that re-exports a module's contents. It is genuinely
useful and genuinely expensive, and which one you get depends entirely on scope.

**Use one as a folder's public API.** One `index.ts` per component or feature
folder, exporting the few things outsiders may use. That is what makes
`helpers.ts` and `constants.ts` private, and it is the whole basis of the
boundaries in `placement.md`.

**Do not build barrels that aggregate broadly.** A root `index.ts` re-exporting
every component, or a barrel that re-exports other barrels, inflates the module
graph: importing one small thing forces the toolchain to read and analyze
everything alongside it. Atlassian measured what this costs at scale — removing
them cut build minutes by 75%, reduced triggered unit tests from 1,600 to 200,
and sped up TypeScript's own analysis by over 30%. The mechanism that hurts most
is blast radius: barrels make CI believe everything changed.

Rules of thumb:

- One barrel per folder, listing its public API explicitly.
- Never `export *` — it defeats tree-shaking and hides what is public.
- Never chain barrels through barrels.
- Import directly from the source file when you are inside the same folder.

This is a place where credible sources disagree; `README.md` records the
argument and why this middle position was chosen.

## File naming

Consistency matters far more than which convention you pick — there is no
authority that settles this, and mixed casing is the only choice that actually
breaks things (Linux is case-sensitive, macOS and Windows are not, so a rename
that works locally fails in CI).

The convention here:

| Thing | Casing | Example |
|---|---|---|
| Component file and its folder | PascalCase | `AgentCard/AgentCard.tsx` |
| Shared component folder | kebab-case | `components/severity-counts/` |
| Non-component module | kebab-case | `lib/github-urls.ts`, `lib/model-label.ts` |
| Framework-reserved files | lowercase | `page.tsx`, `layout.tsx`, `not-found.tsx` |
| Colocated support files | lowercase | `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts` |
| Tests | mirrors its subject | `AgentCard.test.tsx`, `severity.test.ts` |

Name a module after what it is about, not after its layer. `severity.ts` tells
you something; `service.ts` does not.
