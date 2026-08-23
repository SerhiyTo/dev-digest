import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoBasics } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * T1.4 — Facade degraded contract (acceptance #10).
 *
 * When `repoIntelEnabled=false` (opt-out; the default is now ON), every facade
 * method MUST return a safe degraded value WITHOUT throwing. Consumers (run-executor,
 * blast, hooks) downgrade to their pre-T1.3 behavior on these returns; if any
 * method threw or returned malformed shape, every consumer would crash.
 *
 * No Postgres, no clone. The service's `repo` (RepoIntelRepository) is patched
 * to return null/[] so we exercise the degraded paths cleanly.
 */

function buildDegradedService(opts: {
  flag: boolean;
  basics?: RepoBasics | null;
  indexStateRow?: IndexState | null;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    // codeIndex is reached by getBlastRadius; we stub minimal behaviour.
    codeIndex: {
      symbols: async () => [],
      references: async () => [],
    } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => opts.basics ?? null,
    tryGetIndexState: async () => opts.indexStateRow ?? null,
    getCachedSymbols: async () => [],
    getCachedSymbolsForFiles: async () => [],
    getCachedReferencesTo: async () => [],
  };
  return svc;
}

describe('RepoIntel facade — degraded contract (flag off)', () => {
  it('getUnresolvedReferences → [] when repoIntelEnabled=false', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures → [] when repoIntelEnabled=false', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getBlastRadius → degraded-but-valid shape (never throws)', async () => {
    const svc = buildDegradedService({ flag: false, basics: null });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    // Shape (every key present, arrays where arrays go) — consumers assume this.
    expect(Array.isArray(blast.changedSymbols)).toBe(true);
    expect(Array.isArray(blast.callers)).toBe(true);
    expect(Array.isArray(blast.impactedEndpoints)).toBe(true);
    expect(blast.degraded).toBe(true);
    // reason is one of the documented DegradedReason values
    expect(['flag_off', 'no_data', 'index_failed', 'index_partial', 'repo_too_large'])
      .toContain(blast.reason);
  });

  it('getIndexState → degraded row (never throws) when no row exists', async () => {
    const svc = buildDegradedService({ flag: false, indexStateRow: null });
    const state = await svc.getIndexState('r1');
    // Always-present fields the UI / dashboard rely on (client bind).
    expect(state.repoId).toBe('r1');
    expect(state.status).toBe('degraded');
    expect(state.filesIndexed).toBe(0);
    expect(state.filesSkipped).toBe(0);
    expect(state.lastIndexedSha).toBe(''); // empty string, not undefined — JSON-safe
    expect(state.indexerVersion).toBeGreaterThanOrEqual(1);
    expect(state.updatedAt instanceof Date).toBe(true);
    expect(state.degraded).toBe(true);
  });

  it('getRepoMap → degraded ({ text:"", tokens:0, cached:false, degraded:true })', async () => {
    const svc = buildDegradedService({ flag: false });
    const map = await svc.getRepoMap('r1');
    expect(map.text).toBe('');
    expect(map.tokens).toBe(0);
    expect(map.cached).toBe(false);
    expect(map.degraded).toBe(true);
  });

  it('getFileRank / getSymbolsInFiles / getConventionSamples / getTopFilesByRank / getCriticalPaths → []', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getFileRank('r1', ['a.ts'])).resolves.toEqual([]);
    await expect(svc.getSymbolsInFiles('r1', ['a.ts'])).resolves.toEqual([]);
    await expect(svc.getConventionSamples('r1', 12)).resolves.toEqual([]);
    await expect(svc.getTopFilesByRank('r1', 7)).resolves.toEqual([]);
    await expect(svc.getCriticalPaths('r1')).resolves.toEqual([]);
  });

  it('indexRepo / refreshIndex → degraded T1 skeleton (never throws)', async () => {
    const svc = buildDegradedService({ flag: false });
    const a = await svc.indexRepo('r1');
    const b = await svc.refreshIndex('r1');
    expect(a.status).toBe('degraded');
    expect(b.status).toBe('degraded');
    expect(a.filesIndexed).toBe(0);
    expect(b.filesIndexed).toBe(0);
  });
});

describe('RepoIntel facade — degraded contract (flag on, but no data)', () => {
  it('getCallerSignatures with no clone → [] (graceful degrade, no throw)', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: null } });
    await expect(svc.getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getUnresolvedReferences with no clone → []', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: null } });
    await expect(svc.getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures with empty changedFiles → []', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: '/tmp' } });
    await expect(svc.getCallerSignatures('r1', [])).resolves.toEqual([]);
  });
});

/**
 * T3.4 — do not poison the phantom gate.
 *
 * `getUnresolvedReferences` is diff-scoped/ephemeral (astgrep `parseInvocationHeads`,
 * which only ever emits call/new/JSX invocation heads — it never touches
 * `parseReferences`'s new `kind: 'type'` usages). This locks down the actual
 * cross-feature invariant T3.1 must not break: a bare type-position identifier
 * with no matching declaration/import must NEVER be reported as a phantom,
 * only a genuinely undeclared/unimported CALL should be.
 */
describe('RepoIntel facade — phantom gate excludes type usages', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('flags an unresolved call but never a bare type-position identifier', async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-phantom-'));
    const rel = 'src/thing.ts';
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(
      join(root, rel),
      'export function useThing(x: UndeclaredType): void {\n  undeclaredCall(x);\n}\n',
      'utf8',
    );

    const svc = buildDegradedService({
      flag: true,
      basics: { id: 'r1', owner: 'a', name: 'b', clonePath: root },
    });
    const refs = await svc.getUnresolvedReferences('r1', [rel]);
    const names = refs.map((r) => r.symbolName);

    expect(names).toContain('undeclaredCall');
    expect(names).not.toContain('UndeclaredType');
  });
});

/**
 * T2.4 — Vue/Nuxt auto-import carve-out (three tiers, `.vue` files only).
 *
 * `defineProps`/`computed`/`useI18n` are ordinary calls with no import
 * statement in real `<script setup>` code — without the carve-out every one
 * of them is a phantom-gate false positive. `useLocalThing` is seeded from
 * the repo's own `composables/` directory (Nuxt's `imports.dirs`
 * convention), not hardcoded. A genuinely undeclared call must still surface
 * — the carve-out must not blanket-exempt `.vue` files from the gate.
 */
describe('RepoIntel facade — Vue/Nuxt auto-import carve-out', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('does not flag compiler macros, framework auto-imports, or local composables — but still flags a real phantom', async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-vue-carveout-'));
    await mkdir(join(root, 'composables'), { recursive: true });
    await writeFile(
      join(root, 'composables/useLocalThing.ts'),
      'export function useLocalThing() { return 42; }\n',
      'utf8',
    );
    const rel = 'Widget.vue';
    await writeFile(
      join(root, rel),
      [
        '<script setup lang="ts">',
        'const props = defineProps<{ id: number }>()',
        'const count = computed(() => props.id + 1)',
        'const { t } = useI18n()',
        'const thing = useLocalThing()',
        'phantomCall()',
        '</script>',
        '<template><div>{{ count }}</div></template>',
        '',
      ].join('\n'),
      'utf8',
    );

    const svc = buildDegradedService({
      flag: true,
      basics: { id: 'r1', owner: 'a', name: 'b', clonePath: root },
    });
    const refs = await svc.getUnresolvedReferences('r1', [rel]);
    const names = refs.map((r) => r.symbolName);

    expect(names).not.toContain('defineProps');
    expect(names).not.toContain('computed');
    expect(names).not.toContain('useI18n');
    expect(names).not.toContain('useLocalThing');
    expect(names).toContain('phantomCall');
  });
});
