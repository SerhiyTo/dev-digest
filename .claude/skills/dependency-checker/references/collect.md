# Collecting the data

## The collector

```bash
node .claude/skills/dependency-checker/assets/collect-deps.mjs [repo-root] [--audit] > /tmp/deps.json
```

`repo-root` defaults to the working directory. The script is dependency-free
Node, reads only, and writes one JSON object to stdout.

`--audit` additionally runs `pnpm audit --json` / `npm audit --json` in each
package. It is off by default because it needs the network and takes tens of
seconds. Pass it only when the user asked about vulnerabilities.

**What it does that a generic tool cannot.** It resolves every tsconfig `paths`
entry to the package the target actually lives in, which is the only way to see
cross-package edges in a repo with no workspace. It strips comments and blanks
template literals before scanning for imports, so a commented-out import, a
prompt string, or a test fixture containing `import 'x'` does not become a
phantom dependency. And it enumerates sources through `git ls-files`, so ignored
trees — build output, `server/clones/`, `node_modules` — never enter the count.

## The JSON

| Key | Shape | What it is |
|---|---|---|
| `packages[]` | `folder`, `name`, `packageManager`, `lockfile`, `nodeModulesSize`, `sourceFiles`, `dependencyCount`, `devDependencyCount`, `tsconfigAliases[]`, `aliasUsage[]` | One per package root |
| `externalDeps[]` | `name`, `usedBy[]` of `{package, section, range, resolved, size, importCount, importedIn[]}` | Every declared npm dependency, per package that declares it |
| `crossPackageEdges[]` | `from`, `to`, `kind`, `via`, `count`, `evidence[]` | Package → package. `kind` is `alias` (a tsconfig `paths` entry) or `deep-relative` (a `../` import escaping the package) |
| `versionDrift[]` | `name`, `declared{}`, `resolved{}`, `distinctRanges`, `distinctResolved` | Declared ranges **and** what is actually on disk. They disagree more often than you would think |
| `duplicateInstalls[]` | `name`, `installs[]`, `totalSizeKb`, `sameVersion` | The cost of having no workspace |
| `unused[]` | `package`, `dep`, `section`, `referencedIn`, `confidence` | `confidence: "high"` means nothing found it anywhere. `"low"` means `referencedIn` names where it turned up |
| `phantom[]` | `package`, `spec`, `importedIn[]` | Imported, never declared. Works today only through hoisting |
| `misplaced[]` | `package`, `dep`, `declaredIn`, `kind`, `evidence[]` | `runtime-import-declared-as-dev` or `test-only-declared-as-runtime` |
| `heaviest[]` | `package`, `dep`, `section`, `size` | Top 25 by installed size |
| `audit` | per package, or `null` | Only with `--audit` |
| `warnings[]` | strings | Parse failures and degraded modes. Read it — an empty array is part of the result |

## Slicing it

The file is tens of KB; `externalDeps` is most of it. Read what you need.

```bash
J=/tmp/deps.json

# the shape of the repo
node -e 'const j=require(process.env.J);console.log(j.packages.map(p=>
  `${p.folder} ${p.packageManager} ${p.dependencyCount}+${p.devDependencyCount} deps ${p.nodeModulesSize}`).join("\n"))' J=$J

# every cross-package edge with its evidence
node -e 'const j=require(process.env.J);for(const e of j.crossPackageEdges)
  console.log(`${e.from} -> ${e.to} [${e.kind}] via ${e.via} x${e.count}  ${e.evidence.join(", ")}`)' J=$J

# only the unused candidates worth opening a file over
node -e 'const j=require(process.env.J);console.log(j.unused.filter(u=>u.confidence==="high"))' J=$J

# one dependency, everywhere it is declared
node -e 'const j=require(process.env.J);console.log(j.externalDeps.find(d=>d.name===process.env.D))' J=$J D=zod
```

## Manual fallback

Use it when the collector cannot run, or when `node_modules` is not installed
(sizes are then unavailable — say so in `Scope` rather than guessing).

```bash
# the package roots and their managers
for d in */; do [ -f "$d/package.json" ] && echo "$d $(ls $d | grep -E 'pnpm-lock|package-lock|yarn.lock')"; done

# declared dependencies of one package
node -e 'const p=require("./server/package.json");console.log(p.dependencies,p.devDependencies)'

# installed size, per direct dependency, following pnpm's symlinks
du -skL server/node_modules/* | sort -rn | head -20

# what a package actually resolved to
node -e 'console.log(require("./client/node_modules/zod/package.json").version)'

# is it imported at all — never conclude from this alone
grep -rn --include='*.ts' --include='*.tsx' "from ['\"]zod" server/src | head

# why is this here (pnpm) / where did it come from (npm)
pnpm -C server why zod
npm --prefix reviewer-core ls zod
```

`grep` sees imports and nothing else. Before calling anything unused, also check
`package.json` `scripts`, the package's root config files, and string literals in
source — see `findings-catalog.md`.

## Degraded modes to declare in `Scope`

- `node_modules` missing for a package → no sizes, no resolved versions for it.
- `git ls-files` unavailable → the collector falls back to a filesystem walk and
  says so in `warnings`; ignored trees may be counted.
- `--audit` not run → say the vulnerability count is unknown rather than implying zero.
