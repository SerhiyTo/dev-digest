import { describe, it, expect } from 'vitest';
import {
  buildSmartDiffModel,
  classifyPath,
  findingLinesFor,
  isTestPath,
  orderGroup,
  type ClassifiedFile,
} from '../src/modules/smart-diff/classify.js';
import type {
  SmartDiffFileRow,
  SmartDiffFindingRow,
} from '../src/modules/smart-diff/ports.js';

function file(path: string, additions = 1, deletions = 0): SmartDiffFileRow {
  return { path, additions, deletions };
}

function finding(
  path: string,
  startLine: number,
  severity: string,
  endLine = startLine,
): SmartDiffFindingRow {
  return { file: path, startLine, endLine, severity };
}

describe('classifyPath', () => {
  it('sends lockfiles, build output, snapshots and generated artifacts to boilerplate', () => {
    for (const path of [
      'pnpm-lock.yaml',
      'yarn.lock',
      'Gemfile.lock',
      'go.sum',
      'client/dist/index.js',
      'a/__snapshots__/x.snap',
      'web/static/app.min.js',
      'types/api.d.ts',
      'public/logo.svg',
      'server/src/generated/schema.ts',
      'server/src/modules/billing/fixture.bin',
      'tools/helper.exe',
      'data/cache.sqlite',
    ]) {
      expect(classifyPath(path), path).toBe('boilerplate');
    }
  });

  it('sends config, barrels, CI, migrations and docs to wiring', () => {
    for (const path of [
      'package.json',
      'tsconfig.json',
      'Dockerfile',
      'next.config.mjs',
      'server/src/modules/smart-diff/index.ts',
      '.github/workflows/ci.yml',
      'server/src/db/migrations/0020_x.sql',
      'docs/plan.md',
      'scripts/e2e.sh',
      'client/messages/en/prReview.json',
    ]) {
      expect(classifyPath(path), path).toBe('wiring');
    }
  });

  it('falls through to core for business logic and its tests', () => {
    for (const path of [
      'server/src/modules/billing/service.ts',
      'client/src/lib/severity.ts',
      'server/test/billing.test.ts',
      'reviewer-core/src/review/run.ts',
    ]) {
      expect(classifyPath(path), path).toBe('core');
    }
  });

  it('matches path segments exactly, never as substrings', () => {
    expect(classifyPath('mydist/a.ts')).toBe('core');
    expect(classifyPath('distributed/b.ts')).toBe('core');
    expect(classifyPath('src/public-api/handler.ts')).toBe('core');
    expect(classifyPath('src/dist/c.ts')).toBe('boilerplate');
  });

  it('lets boilerplate win over wiring when a path matches both', () => {
    expect(classifyPath('dist/index.js')).toBe('boilerplate');
    expect(classifyPath('pnpm-workspace.yaml')).toBe('boilerplate');
  });

  it('normalises separators, case and a leading ./', () => {
    expect(classifyPath('.\\client\\dist\\index.js')).toBe('boilerplate');
    expect(classifyPath('./PACKAGE.JSON')).toBe('wiring');
  });
});

describe('isTestPath', () => {
  it('recognises test suffixes and test directories', () => {
    expect(isTestPath('server/test/billing.test.ts')).toBe(true);
    expect(isTestPath('server/test/x.it.test.ts')).toBe(true);
    expect(isTestPath('client/src/a/__tests__/b.tsx')).toBe(true);
    expect(isTestPath('server/src/modules/billing/service.ts')).toBe(false);
  });
});

describe('findingLinesFor', () => {
  it('expands, unions and sorts ranges', () => {
    const { lines } = findingLinesFor([
      finding('a.ts', 52, 'WARNING', 53),
      finding('a.ts', 28, 'SUGGESTION'),
      finding('a.ts', 28, 'CRITICAL'),
    ]);
    expect(lines).toEqual([28, 52, 53]);
  });

  it('clamps an implausible span instead of allocating it', () => {
    const { lines, clamped } = findingLinesFor([finding('a.ts', 1, 'WARNING', 1_000_000)]);
    expect(clamped).toBe(1);
    expect(lines).toHaveLength(501);
    expect(lines.at(-1)).toBe(501);
  });

  it('ignores a non-positive start line', () => {
    expect(findingLinesFor([finding('a.ts', 0, 'WARNING')]).lines).toEqual([]);
  });

  it('tolerates a reversed range', () => {
    expect(findingLinesFor([finding('a.ts', 9, 'WARNING', 7)]).lines).toEqual([7, 8, 9]);
  });
});

describe('orderGroup', () => {
  const base: Omit<ClassifiedFile, 'path' | 'findingWeight' | 'isTest'> = {
    additions: 10,
    deletions: 0,
    role: 'core',
    findingLines: [],
  };

  it('puts one CRITICAL above five WARNINGs', () => {
    const ordered = orderGroup([
      { ...base, path: 'warnings.ts', isTest: false, findingWeight: 500 },
      { ...base, path: 'critical.ts', isTest: false, findingWeight: 10_000 },
    ]);
    expect(ordered.map((f) => f.path)).toEqual(['critical.ts', 'warnings.ts']);
  });

  it('demotes a test below a same-weight non-test', () => {
    const ordered = orderGroup([
      { ...base, path: 'a.test.ts', isTest: true, findingWeight: 0 },
      { ...base, path: 'z.ts', isTest: false, findingWeight: 0 },
    ]);
    expect(ordered.map((f) => f.path)).toEqual(['z.ts', 'a.test.ts']);
  });

  it('breaks remaining ties by size then by path, without localeCompare', () => {
    const ordered = orderGroup([
      { ...base, path: 'b.ts', isTest: false, findingWeight: 0, additions: 1 },
      { ...base, path: 'a.ts', isTest: false, findingWeight: 0, additions: 1 },
      { ...base, path: 'big.ts', isTest: false, findingWeight: 0, additions: 90 },
    ]);
    expect(ordered.map((f) => f.path)).toEqual(['big.ts', 'a.ts', 'b.ts']);
  });
});

describe('buildSmartDiffModel', () => {
  const mixed: SmartDiffFileRow[] = [
    file('server/src/modules/billing/service.ts', 84, 12),
    file('client/src/lib/x.ts', 20, 3),
    file('server/test/billing.test.ts', 30, 0),
    file('package.json', 3, 1),
    file('server/src/db/migrations/0020_x.sql', 12, 0),
    file('.github/workflows/ci.yml', 4, 0),
    file('docs/notes.md', 6, 0),
    file('pnpm-lock.yaml', 92, 24),
    file('client/dist/bundle.js', 500, 40),
    file('types/api.d.ts', 8, 2),
    file('public/logo.svg', 1, 0),
    file('client/src/lib/y.ts', 5, 5),
  ];

  it('places every file in exactly one group and loses none', () => {
    const model = buildSmartDiffModel(mixed, []);
    const paths = model.groups.flatMap((g) => g.files.map((f) => f.path));
    expect(paths).toHaveLength(mixed.length);
    expect(new Set(paths)).toEqual(new Set(mixed.map((f) => f.path)));
  });

  it('emits groups in core, wiring, boilerplate order', () => {
    const model = buildSmartDiffModel(mixed, []);
    expect(model.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
  });

  it('omits an empty group rather than emitting an empty header', () => {
    const model = buildSmartDiffModel([file('pnpm-lock.yaml', 92, 24)], []);
    expect(model.groups.map((g) => g.role)).toEqual(['boilerplate']);
  });

  it('leaves finding_lines empty and weights flat before any review', () => {
    const model = buildSmartDiffModel(mixed, []);
    const core = model.groups.find((g) => g.role === 'core');
    expect(core?.files.every((f) => f.findingLines.length === 0)).toBe(true);
    expect(model.stats.findingFiles).toBe(0);
  });

  it('sorts the findings-bearing core file to the top of its group', () => {
    const model = buildSmartDiffModel(mixed, [
      finding('client/src/lib/y.ts', 12, 'CRITICAL'),
      finding('server/src/modules/billing/service.ts', 5, 'SUGGESTION'),
    ]);
    const core = model.groups.find((g) => g.role === 'core');
    expect(core?.files[0]?.path).toBe('client/src/lib/y.ts');
    expect(core?.files[0]?.findingLines).toEqual([12]);
    expect(model.stats.findingFiles).toBe(2);
  });

  it('ignores an unknown severity in the ordering weight', () => {
    const model = buildSmartDiffModel(mixed, [finding('client/src/lib/y.ts', 12, 'INFO')]);
    const core = model.groups.find((g) => g.role === 'core');
    expect(core?.files.find((f) => f.path === 'client/src/lib/y.ts')?.findingWeight).toBe(0);
    expect(core?.files[0]?.path).toBe('server/src/modules/billing/service.ts');
  });

  it('reports findings that name a file absent from the diff', () => {
    const model = buildSmartDiffModel(mixed, [finding('server/src/gone.ts', 4, 'CRITICAL')]);
    expect(model.stats.orphanFiles).toEqual(['server/src/gone.ts']);
    const paths = model.groups.flatMap((g) => g.files.map((f) => f.path));
    expect(paths).not.toContain('server/src/gone.ts');
  });

  it('de-duplicates repeated pr_files rows and reports them', () => {
    const model = buildSmartDiffModel([file('a.ts', 1), file('a.ts', 2)], []);
    expect(model.stats.duplicatePaths).toEqual(['a.ts']);
    expect(model.groups.flatMap((g) => g.files)).toHaveLength(1);
  });

  it('counts total_lines over every file, including boilerplate', () => {
    const model = buildSmartDiffModel(mixed, []);
    const expected = mixed.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    expect(model.split.total_lines).toBe(expected);
    expect(model.stats.reviewableLines).toBeLessThan(expected);
  });

  it('does not flag a small change buried under a huge lockfile', () => {
    const model = buildSmartDiffModel(
      [file('server/src/a.ts', 2, 1), file('pnpm-lock.yaml', 6_000, 3_000)],
      [],
    );
    expect(model.split.too_big).toBe(false);
    expect(model.split.proposed_splits).toEqual([]);
    expect(model.split.total_lines).toBe(9_003);
  });

  it('leaves a 50-line pull request alone', () => {
    const model = buildSmartDiffModel([file('server/src/a.ts', 40, 10)], []);
    expect(model.split.too_big).toBe(false);
    expect(model.split.proposed_splits).toEqual([]);
  });

  it('proposes prefix splits for a large cross-package change and drops no file', () => {
    const big: SmartDiffFileRow[] = [
      file('server/src/a.ts', 200, 0),
      file('server/src/b.ts', 150, 0),
      file('client/src/c.tsx', 300, 0),
      file('client/src/d.tsx', 250, 0),
      file('reviewer-core/src/e.ts', 5, 0),
    ];
    const model = buildSmartDiffModel(big, []);
    expect(model.split.too_big).toBe(true);
    expect(model.split.proposed_splits.map((s) => s.name)).toEqual(['client/src', 'server/src']);
    const split = model.split.proposed_splits.flatMap((s) => s.files);
    expect(new Set(split)).toEqual(new Set(big.map((f) => f.path)));
  });

  it('flags too many core files even when each change is small', () => {
    const many = Array.from({ length: 13 }, (_, i) => file(`server/src/m${i}.ts`, 1, 0));
    const model = buildSmartDiffModel(many, []);
    expect(model.split.too_big).toBe(true);
  });

  it('suggests nothing when one bucket holds everything', () => {
    const model = buildSmartDiffModel(
      [file('server/src/a.ts', 300, 0), file('server/src/b.ts', 300, 0)],
      [],
    );
    expect(model.split.too_big).toBe(true);
    expect(model.split.proposed_splits).toEqual([]);
  });
});
