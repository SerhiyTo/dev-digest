#!/usr/bin/env node
// Repo-wide dependency inventory for the `dependency-checker` skill.
//
// This repo is NOT a workspace: six packages, six package.json files, two
// package managers, and cross-package links made of tsconfig path aliases
// rather than `workspace:*`. No off-the-shelf tool reads that shape, so this
// one does: it reads every package.json, resolves every tsconfig `paths`
// entry to the package it actually points at, walks the sources for real
// imports, and measures what is on disk.
//
// Emits one JSON object on stdout. It reports; it never changes anything.
//
// Usage: node collect-deps.mjs [repo-root] [--audit]
//   --audit  also run `pnpm audit` / `npm audit` per package (network, slow)

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { builtinModules } from 'node:module'
import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)
const WANT_AUDIT = argv.includes('--audit')
const ROOT = resolve(argv.find((a) => !a.startsWith('--')) ?? '.')

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.git',
  '.turbo', '.vercel', 'results', 'fixtures',
])
const SOURCE_EXT = /\.[mc]?[jt]sx?$/
const TEST_FILE = /(\.test\.|\.spec\.|(^|\/)(test|tests|__tests__)\/)/
const CONFIG_FILE = /(^|\.)(config)\.[mc]?[jt]s$/
const BUILTINS = new Set(builtinModules)
const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb'])

const warnings = []

// ---------------------------------------------------------------- utilities

function stripComments(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && d === '*') {
      out += '  '
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      out += '  '
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const blank = c === '`'
      const keep = (ch) => (blank ? (ch === '\n' ? '\n' : ' ') : ch)
      out += c
      i++
      while (i < src.length) {
        if (src[i] === '\\') { out += keep(src[i]) + keep(src[i + 1] ?? ''); i += 2; continue }
        const closed = src[i] === c
        out += closed ? src[i] : keep(src[i])
        i++
        if (closed) break
      }
      continue
    }
    out += c
    i++
  }
  return out
}

function parseJsonc(text, label) {
  try {
    return JSON.parse(stripComments(text).replace(/,(\s*[}\]])/g, '$1'))
  } catch (err) {
    warnings.push(`could not parse ${label}: ${err.message}`)
    return null
  }
}

function readJsonc(path) {
  if (!existsSync(path)) return null
  return parseJsonc(readFileSync(path, 'utf8'), relative(ROOT, path))
}

function duKb(path, follow = false) {
  if (!existsSync(path)) return null
  const r = spawnSync('du', follow ? ['-s', '-k', '-L', path] : ['-s', '-k', path], { encoding: 'utf8' })
  if (r.status !== 0) return null
  const kb = Number.parseInt(r.stdout.trim().split(/\s+/)[0], 10)
  return Number.isFinite(kb) ? kb : null
}

function human(kb) {
  if (kb == null) return null
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function walk(dir, acc = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (SOURCE_EXT.test(e.name)) acc.push(full)
  }
  return acc
}

function gitTrackedFiles() {
  const r = spawnSync('git', ['-C', ROOT, 'ls-files', '-c', '-o', '--exclude-standard', '-z'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0 || !r.stdout) return null
  return r.stdout.split('\0').filter(Boolean).map((f) => join(ROOT, f))
}

const TRACKED = gitTrackedFiles()

function inSkippedPath(file) {
  return relative(ROOT, file).split('/').some((seg) => SKIP_DIRS.has(seg) || (seg.startsWith('.') && seg.includes('/') === false && seg !== '.'))
}

function sourcesOf(pkg) {
  if (!TRACKED) return walk(pkg.dir)
  return TRACKED.filter((f) => f.startsWith(pkg.dir + '/') && SOURCE_EXT.test(f) && !inSkippedPath(f))
}

function externalName(spec) {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

// -------------------------------------------------------- package discovery

function discoverPackages() {
  const found = []
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
    const dir = join(ROOT, e.name)
    const pkgJson = readJsonc(join(dir, 'package.json'))
    if (!pkgJson) continue
    const pnpm = existsSync(join(dir, 'pnpm-lock.yaml'))
    const npm = existsSync(join(dir, 'package-lock.json'))
    const yarn = existsSync(join(dir, 'yarn.lock'))
    found.push({
      name: pkgJson.name ?? e.name,
      folder: e.name,
      dir,
      version: pkgJson.version ?? null,
      private: pkgJson.private === true,
      packageManager: pnpm ? 'pnpm' : npm ? 'npm' : yarn ? 'yarn' : 'unknown',
      lockfile: pnpm ? 'pnpm-lock.yaml' : npm ? 'package-lock.json' : yarn ? 'yarn.lock' : null,
      dependencies: pkgJson.dependencies ?? {},
      devDependencies: pkgJson.devDependencies ?? {},
      scriptsText: JSON.stringify(pkgJson.scripts ?? {}),
    })
  }
  return found.sort((a, b) => a.folder.localeCompare(b.folder))
}

if (!TRACKED) {
  warnings.push('git ls-files unavailable — fell back to a filesystem walk, so ignored trees (clones, build output) may be counted')
}

const packages = discoverPackages()
if (packages.length === 0) {
  console.error(`no package.json found one level under ${ROOT}`)
  process.exit(1)
}

function packageOwning(absPath) {
  let best = null
  for (const p of packages) {
    if (absPath === p.dir || absPath.startsWith(p.dir + '/')) {
      if (!best || p.dir.length > best.dir.length) best = p
    }
  }
  return best
}

// ------------------------------------------------------------ tsconfig paths

function loadAliases(pkg) {
  const tsconfigPath = join(pkg.dir, 'tsconfig.json')
  let cfg = readJsonc(tsconfigPath)
  if (!cfg) return []
  if (cfg.extends && typeof cfg.extends === 'string' && cfg.extends.startsWith('.')) {
    const base = readJsonc(resolve(pkg.dir, cfg.extends))
    if (base) cfg = { ...base, ...cfg, compilerOptions: { ...base.compilerOptions, ...cfg.compilerOptions } }
  }
  const co = cfg.compilerOptions ?? {}
  const baseUrl = resolve(pkg.dir, co.baseUrl ?? '.')
  return Object.entries(co.paths ?? {}).map(([key, targets]) => ({
    key,
    prefix: key.includes('*') ? key.slice(0, key.indexOf('*')) : null,
    targets: (targets ?? []).map((t) => resolve(baseUrl, t)),
  }))
}

for (const pkg of packages) pkg.aliases = loadAliases(pkg)

function matchAlias(pkg, spec) {
  for (const a of pkg.aliases) {
    if (a.prefix == null) {
      if (spec === a.key) return { alias: a, target: a.targets[0] ?? null }
    } else if (spec.startsWith(a.prefix)) {
      const rest = spec.slice(a.prefix.length)
      const target = a.targets[0] ? a.targets[0].replace('*', rest) : null
      return { alias: a, target }
    }
  }
  return null
}

// ------------------------------------------------------------ import scanning

const IMPORT_PATTERNS = [
  /^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"\n]+)['"]/gm,
  /^[ \t]*import\s+['"]([^'"\n]+)['"]/gm,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]/g,
]

function specifiersIn(source) {
  const hits = new Map()
  for (const re of IMPORT_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length
      hits.set(`${m[1]}@${line}`, { spec: m[1], line })
    }
  }
  return [...hits.values()]
}

const crossEdges = new Map()
const phantom = []

for (const pkg of packages) {
  pkg.sourceFiles = 0
  pkg.externalUse = new Map()
  pkg.aliasUse = new Map()
  const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)])
  const phantomHits = new Map()

  pkg.files = sourcesOf(pkg)

  for (const file of pkg.files) {
    pkg.sourceFiles++
    const rel = relative(ROOT, file)
    const isTest = TEST_FILE.test(rel)
    const isConfig = CONFIG_FILE.test(file) || dirname(file) === pkg.dir
    const source = stripComments(readFileSync(file, 'utf8'))

    for (const { spec, line } of specifiersIn(source)) {
      const where = `${rel}:${line}`

      if (spec.startsWith('node:') || BUILTINS.has(spec)) continue

      const aliased = matchAlias(pkg, spec)
      const pinsExternal = aliased != null && (aliased.target ?? '').includes('/node_modules/')
      if (aliased && !pinsExternal) {
        const bucket = pkg.aliasUse.get(aliased.alias.key) ?? { key: aliased.alias.key, count: 0, sites: [] }
        bucket.count++
        if (bucket.sites.length < 3) bucket.sites.push(where)
        pkg.aliasUse.set(aliased.alias.key, bucket)

        const owner = aliased.target ? packageOwning(aliased.target) : null
        if (owner && owner.folder !== pkg.folder) addEdge(pkg, owner, 'alias', aliased.alias.key, where)
        continue
      }

      if (spec.startsWith('.')) {
        const abs = resolve(dirname(file), spec)
        if (!abs.startsWith(pkg.dir + '/')) {
          const owner = packageOwning(abs)
          if (owner && owner.folder !== pkg.folder) {
            addEdge(pkg, owner, 'deep-relative', relative(ROOT, abs), where)
          }
        }
        continue
      }

      const name = externalName(spec)
      const bucket = pkg.externalUse.get(name) ?? { name, count: 0, sites: [], runtime: false, test: false }
      bucket.count++
      if (isTest) bucket.test = true
      else if (!isConfig) bucket.runtime = true
      if (bucket.sites.length < 3) bucket.sites.push(where)
      pkg.externalUse.set(name, bucket)

      if (!declared.has(name)) {
        const p = phantomHits.get(name) ?? { package: pkg.folder, spec: name, importedIn: [] }
        if (p.importedIn.length < 3) p.importedIn.push(where)
        phantomHits.set(name, p)
      }
    }
  }
  phantom.push(...phantomHits.values())
}

function addEdge(from, to, kind, via, where) {
  const key = `${from.folder}->${to.folder}:${kind}:${via}`
  const edge = crossEdges.get(key) ?? {
    from: from.folder, to: to.folder, kind, via, count: 0, evidence: [],
  }
  edge.count++
  if (edge.evidence.length < 3) edge.evidence.push(where)
  crossEdges.set(key, edge)
}

// ------------------------------------------------------------- sizes on disk

for (const pkg of packages) {
  const nm = join(pkg.dir, 'node_modules')
  pkg.nodeModulesInstalled = existsSync(nm)
  pkg.nodeModulesSizeKb = pkg.nodeModulesInstalled ? duKb(nm) : null
}

function installedInfo(pkg, dep) {
  const dir = join(pkg.dir, 'node_modules', dep)
  if (!existsSync(dir)) return { resolved: null, sizeKb: null }
  let resolved = null
  try { resolved = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? null } catch {}
  return { resolved, sizeKb: duKb(dir, true) }
}

// -------------------------------------------------------------- external map

const externalDeps = new Map()

for (const pkg of packages) {
  for (const [section, deps] of [['dependencies', pkg.dependencies], ['devDependencies', pkg.devDependencies]]) {
    for (const [dep, range] of Object.entries(deps)) {
      const { resolved, sizeKb } = installedInfo(pkg, dep)
      const use = pkg.externalUse.get(dep)
      const entry = externalDeps.get(dep) ?? { name: dep, usedBy: [] }
      entry.usedBy.push({
        package: pkg.folder,
        section,
        range,
        resolved,
        sizeKb,
        size: human(sizeKb),
        importCount: use?.count ?? 0,
        importedIn: use?.sites ?? [],
      })
      externalDeps.set(dep, entry)
    }
  }
}

// --------------------------------------------------------------- derivations

const versionDrift = []
const duplicateInstalls = []

for (const entry of externalDeps.values()) {
  const ranges = new Set(entry.usedBy.map((u) => u.range))
  const resolvedVersions = new Set(entry.usedBy.map((u) => u.resolved).filter(Boolean))
  if (ranges.size > 1 || resolvedVersions.size > 1) {
    versionDrift.push({
      name: entry.name,
      declared: Object.fromEntries(entry.usedBy.map((u) => [u.package, u.range])),
      resolved: Object.fromEntries(entry.usedBy.map((u) => [u.package, u.resolved])),
      distinctRanges: ranges.size,
      distinctResolved: resolvedVersions.size,
    })
  }
  const installs = entry.usedBy.filter((u) => u.sizeKb != null)
  if (installs.length > 1) {
    duplicateInstalls.push({
      name: entry.name,
      installs: installs.map((u) => ({ package: u.package, version: u.resolved, sizeKb: u.sizeKb, size: human(u.sizeKb) })),
      totalSizeKb: installs.reduce((a, u) => a + u.sizeKb, 0),
      sameVersion: new Set(installs.map((u) => u.resolved)).size === 1,
    })
  }
}

versionDrift.sort((a, b) => b.distinctResolved - a.distinctResolved || a.name.localeCompare(b.name))
duplicateInstalls.sort((a, b) => b.totalSizeKb - a.totalSizeKb)

const unused = []
const misplaced = []

function stringMentionInSource(pkg, dep) {
  for (const file of pkg.files) {
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    if (text.includes(`'${dep}'`) || text.includes(`"${dep}"`)) return relative(ROOT, file)
  }
  return null
}

function binMentionedInScripts(pkg, dep) {
  const installed = readJsonc(join(pkg.dir, 'node_modules', dep, 'package.json'))
  const bin = installed?.bin
  const names = typeof bin === 'string' ? [dep.split('/').pop()] : Object.keys(bin ?? {})
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`).test(pkg.scriptsText)) return `scripts (runs \`${name}\`)`
  }
  return null
}

function mentionedOutsideSource(pkg, dep) {
  if (pkg.scriptsText.includes(dep)) return 'scripts'
  for (const e of readdirSync(pkg.dir, { withFileTypes: true })) {
    if (!e.isFile()) continue
    if (!/\.(json|[mc]?[jt]s|ya?ml)$/.test(e.name)) continue
    if (LOCKFILES.has(e.name) || e.name === 'package.json') continue
    try {
      if (readFileSync(join(pkg.dir, e.name), 'utf8').includes(dep)) return e.name
    } catch {}
  }
  return null
}

for (const pkg of packages) {
  for (const [section, deps] of [['dependencies', pkg.dependencies], ['devDependencies', pkg.devDependencies]]) {
    for (const dep of Object.keys(deps)) {
      const use = pkg.externalUse.get(dep)
      if (!use) {
        const elsewhere = dep.startsWith('@types/')
          ? 'type-only (never imported by design)'
          : mentionedOutsideSource(pkg, dep) ?? binMentionedInScripts(pkg, dep) ?? stringMentionInSource(pkg, dep)
        unused.push({
          package: pkg.folder,
          dep,
          section,
          referencedIn: elsewhere,
          confidence: elsewhere ? 'low' : 'high',
        })
        continue
      }
      if (section === 'devDependencies' && use.runtime) {
        misplaced.push({ package: pkg.folder, dep, declaredIn: section, kind: 'runtime-import-declared-as-dev', evidence: use.sites })
      }
      if (section === 'dependencies' && !use.runtime && use.test) {
        misplaced.push({ package: pkg.folder, dep, declaredIn: section, kind: 'test-only-declared-as-runtime', evidence: use.sites })
      }
    }
  }
}

const heaviest = []
for (const entry of externalDeps.values()) {
  for (const u of entry.usedBy) {
    if (u.sizeKb != null) heaviest.push({ package: u.package, dep: entry.name, section: u.section, sizeKb: u.sizeKb, size: human(u.sizeKb) })
  }
}
heaviest.sort((a, b) => b.sizeKb - a.sizeKb)

// --------------------------------------------------------------------- audit

let audit = null
if (WANT_AUDIT) {
  audit = {}
  for (const pkg of packages) {
    const cmd = pkg.packageManager === 'pnpm' ? 'pnpm' : 'npm'
    const r = spawnSync(cmd, ['audit', '--json'], { cwd: pkg.dir, encoding: 'utf8', timeout: 120000 })
    try {
      audit[pkg.folder] = JSON.parse(r.stdout).metadata?.vulnerabilities ?? { error: 'no metadata in audit output' }
    } catch {
      audit[pkg.folder] = { error: (r.stderr || 'audit failed').trim().split('\n')[0] }
    }
  }
}

// -------------------------------------------------------------------- output

const out = {
  generatedAt: new Date().toISOString(),
  repoRoot: ROOT,
  isWorkspace: false,
  packages: packages.map((p) => ({
    name: p.name,
    folder: p.folder,
    version: p.version,
    private: p.private,
    packageManager: p.packageManager,
    lockfile: p.lockfile,
    nodeModulesInstalled: p.nodeModulesInstalled,
    nodeModulesSizeKb: p.nodeModulesSizeKb,
    nodeModulesSize: human(p.nodeModulesSizeKb),
    sourceFiles: p.sourceFiles,
    dependencyCount: Object.keys(p.dependencies).length,
    devDependencyCount: Object.keys(p.devDependencies).length,
    tsconfigAliases: p.aliases.map((a) => a.key),
    aliasUsage: [...p.aliasUse.values()].sort((a, b) => b.count - a.count),
  })),
  externalDeps: [...externalDeps.values()].sort((a, b) => a.name.localeCompare(b.name)),
  crossPackageEdges: [...crossEdges.values()].sort((a, b) => b.count - a.count),
  versionDrift,
  duplicateInstalls,
  unused: unused.sort((a, b) => a.package.localeCompare(b.package) || a.dep.localeCompare(b.dep)),
  phantom,
  misplaced,
  heaviest: heaviest.slice(0, 25),
  audit,
  warnings,
}

process.stdout.write(JSON.stringify(out, null, 2) + '\n')
