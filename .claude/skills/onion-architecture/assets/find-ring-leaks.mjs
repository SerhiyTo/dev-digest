#!/usr/bin/env node
// Transitive ring leaks: an inner-ring file that reaches infrastructure or the
// framework through a chain of otherwise-innocent files.
//
// dependency-cruiser rules in this skill match a single edge, so they catch
// `domain.ts -> drizzle-orm` and miss `domain.ts -> helpers.ts -> db/rows.ts ->
// db/schema`. Every file in that chain looks clean on its own. This walks the
// graph and prints the whole path, which is what makes it fixable.
//
// Usage: node find-ring-leaks.mjs [src-root]     (default: ./src)

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'

const ROOT = resolve(process.argv[2] ?? 'src')

const RING = [
  [/(^|\/)vendor\/shared\//, 0],
  [/(^|\/)reviewer-core\/src\//, 0],
  [/modules\/[^/]+\/(domain|ports)\.ts$/, 1],
  [/modules\/[^/]+\/service\.ts$/, 2],
  [/modules\/[^/]+\/repository(\.ts$|\/)/, 3],
  [/(^|\/)adapters\//, 3],
  [/(^|\/)db\//, 3],
  [/modules\/[^/]+\/routes\.ts$/, 4],
  [/(^|\/)(app|server)\.ts$/, 4],
  [/(^|\/)platform\/container\.ts$/, 4],
]

const FORBIDDEN_PACKAGE = {
  0: [/^drizzle-orm/, /^fastify/, /^node:/, /^@fastify\//],
  1: [/^drizzle-orm/, /^fastify/, /^node:/, /^@fastify\//],
  2: [/^drizzle-orm/, /^fastify/, /^@fastify\//],
}

const ringOf = (rel) => {
  for (const [re, ring] of RING) if (re.test(rel)) return ring
  return null
}

const sliceOf = (rel) => rel.match(/modules\/([^/]+)\//)?.[1] ?? null

// A service reaching its own slice's repository is a shape this skill permits
// when no port has been earned yet (principle 3). What is never permitted is a
// service reaching db/, adapters/ or the composition root - directly or through
// a helper - because that is infrastructure the slice does not own.
const permitted = (startRel, startRing, targetRel, targetRing) => {
  if (startRing !== 2 || targetRing !== 3) return false
  const slice = sliceOf(startRel)
  return slice !== null && sliceOf(targetRel) === slice
}

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|mts|tsx)$/.test(full) && !/\.d\.ts$/.test(full)) out.push(full)
  }
  return out
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\b[^'"\n]*?from\s*['"]([^'"]+)['"]/g

const resolveLocal = (fromFile, spec) => {
  const base = resolve(dirname(fromFile), spec.replace(/\.js$/, ''))
  for (const cand of [`${base}.ts`, join(base, 'index.ts'), base]) {
    try { if (statSync(cand).isFile()) return cand } catch {}
  }
  return null
}

const files = walk(ROOT)
const graph = new Map()
const packages = new Map()

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const local = []
  const pkgs = []
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1]
    if (spec.startsWith('.')) {
      const target = resolveLocal(file, spec)
      if (target) local.push(target)
    } else {
      pkgs.push(spec)
    }
  }
  graph.set(file, local)
  packages.set(file, pkgs)
}

const leaks = []

for (const start of files) {
  const startRel = relative(ROOT, start)
  const startRing = ringOf(startRel)
  if (startRing === null || startRing > 2) continue

  const queue = [[start, [start]]]
  const seen = new Set([start])

  while (queue.length) {
    const [node, path] = queue.shift()

    for (const pkg of packages.get(node) ?? []) {
      for (const re of FORBIDDEN_PACKAGE[startRing] ?? []) {
        if (re.test(pkg)) {
          leaks.push({ startRel, startRing, path, terminal: pkg, kind: 'package' })
        }
      }
    }

    for (const next of graph.get(node) ?? []) {
      const nextRel = relative(ROOT, next)
      const nextRing = ringOf(nextRel)
      if (nextRing !== null && nextRing > startRing) {
        if (!permitted(startRel, startRing, nextRel, nextRing)) {
          leaks.push({ startRel, startRing, path: [...path, next], terminal: nextRel, terminalRing: nextRing, kind: 'ring' })
        }
        continue
      }
      if (!seen.has(next)) {
        seen.add(next)
        queue.push([next, [...path, next]])
      }
    }
  }
}

const rel = (p) => relative(ROOT, p)

if (!leaks.length) {
  console.log(`ring leaks: none (${files.length} files under ${ROOT})`)
  process.exit(0)
}

const seenKey = new Set()
const unique = leaks.filter((l) => {
  const k = `${l.startRel}|${l.path.map(rel).join('>')}|${l.terminal}`
  if (seenKey.has(k)) return false
  seenKey.add(k)
  return true
})

const hops = (l) => (l.kind === 'package' ? l.path.length : l.path.length - 1)
const transitive = unique.filter((l) => hops(l) > 1)
const direct = unique.filter((l) => hops(l) <= 1)

console.log(
  `ring leaks: ${unique.length} (${transitive.length} transitive) in ${files.length} files`
)
console.log(
  'A transitive leak is an inner-ring file reaching infrastructure through one or'
)
console.log('more intermediate files, each of which looks clean on its own.\n')

const render = (l) => {
  const dest =
    l.kind === 'package'
      ? `package "${l.terminal}"`
      : `${l.terminal} [ring ${l.terminalRing}]`
  const steps = l.path.map(rel)
  const lines = [`  ring ${l.startRing}: ${steps[0]}`]
  for (const s of steps.slice(1)) lines.push(`         -> ${s}`)
  if (l.kind === 'package') lines.push(`         -> ${dest}`)
  else lines[lines.length - 1] += ` [ring ${l.terminalRing}]`
  return lines.join('\n')
}

for (const [label, group] of [
  ['TRANSITIVE', transitive],
  ['DIRECT', direct],
]) {
  if (!group.length) continue
  console.log(`## ${label} (${group.length})\n`)
  for (const l of group) console.log(render(l) + '\n')
}

process.exit(1)
