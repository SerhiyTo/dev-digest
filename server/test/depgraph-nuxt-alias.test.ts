import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectAliases } from '../src/adapters/depgraph/nuxt-alias.js';

/**
 * T1.2 — Nuxt alias detection, pure (no DB/Docker/network).
 *
 * Covers the four shapes the plan calls out: Nuxt 4 (app/ srcDir default),
 * Nuxt 3 (root srcDir default), an explicit srcDir overriding either
 * default, and a non-Nuxt repo left completely untouched.
 */
describe('detectAliases', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('returns null for a repo with no nuxt.config.*', async () => {
    root = await mkdtemp(join(tmpdir(), 'nuxt-alias-none-'));
    await writeFile(join(root, 'package.json'), '{}');

    expect(detectAliases(root)).toBeNull();
  });

  it('Nuxt 4 shape (app/ present, no explicit srcDir) — aliases point at <root>/app', async () => {
    root = await mkdtemp(join(tmpdir(), 'nuxt-alias-v4-'));
    await writeFile(join(root, 'nuxt.config.ts'), 'export default defineNuxtConfig({})\n');
    await mkdir(join(root, 'app'), { recursive: true });

    const aliases = detectAliases(root);
    expect(aliases).toEqual({
      '~': join(root, 'app'),
      '@': join(root, 'app'),
      '~~': root,
      '@@': root,
    });
  });

  it('Nuxt 3 shape (no app/ dir, no explicit srcDir) — aliases point at <root>', async () => {
    root = await mkdtemp(join(tmpdir(), 'nuxt-alias-v3-'));
    await writeFile(join(root, 'nuxt.config.ts'), 'export default defineNuxtConfig({})\n');

    const aliases = detectAliases(root);
    expect(aliases).toEqual({
      '~': root,
      '@': root,
      '~~': root,
      '@@': root,
    });
  });

  it('explicit srcDir in nuxt.config overrides both defaults', async () => {
    root = await mkdtemp(join(tmpdir(), 'nuxt-alias-explicit-'));
    await writeFile(
      join(root, 'nuxt.config.ts'),
      "export default defineNuxtConfig({ srcDir: 'src/' })\n",
    );
    // app/ also exists, but the explicit srcDir must win.
    await mkdir(join(root, 'app'), { recursive: true });

    const aliases = detectAliases(root);
    expect(aliases).toEqual({
      '~': join(root, 'src/'),
      '@': join(root, 'src/'),
      '~~': root,
      '@@': root,
    });
  });
});
