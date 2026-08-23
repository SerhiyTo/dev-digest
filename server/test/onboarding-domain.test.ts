import { describe, it, expect } from 'vitest';
import type { Onboarding, OnboardingSection } from '@devdigest/shared';
import {
  applyCaps,
  degradedFromIndexStatus,
  groundEntries,
  isGroundedPath,
  isStale,
  isValidComplexity,
  reasonNumbersAreGrounded,
  readStoredTour,
  validateSectionKinds,
} from '../src/modules/onboarding/domain.js';
import {
  MAX_CRITICAL_PATHS,
  MAX_DOCUMENT_BYTES,
  MAX_FIRST_TASKS,
  MAX_LINKS,
  MAX_READING_PATH_STEPS,
  MAX_RUN_LOCALLY_STEPS,
  MAX_STRING_CHARS,
  SECTION_KIND_ORDER,
} from '../src/modules/onboarding/constants.js';

const INDEXED_PATHS = new Set(['README.md', 'src/index.ts', 'src/modules/onboarding/service.ts', 'specs']);

function section(overrides: Partial<OnboardingSection> = {}): OnboardingSection {
  return {
    kind: 'architecture',
    title: 'Architecture',
    body: 'prose',
    links: [],
    ...overrides,
  };
}

function fiveSectionTour(overrides: Partial<Record<string, Partial<OnboardingSection>>> = {}): Onboarding {
  return {
    sections: SECTION_KIND_ORDER.map((kind) => section({ kind, ...(overrides[kind] ?? {}) })),
    degraded: false,
    degraded_reason: null,
  };
}

describe('(a) validateSectionKinds — the closed five-kind set', () => {
  it('accepts exactly the five kinds in any order', () => {
    expect(validateSectionKinds([...SECTION_KIND_ORDER])).toEqual({ ok: true });
    expect(validateSectionKinds([...SECTION_KIND_ORDER].reverse())).toEqual({ ok: true });
  });

  it('rejects a missing kind and names it in the reason', () => {
    const result = validateSectionKinds(SECTION_KIND_ORDER.filter((k) => k !== 'first_tasks'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('missing first_tasks');
  });

  it('rejects a sixth, unknown kind and names it in the reason', () => {
    const result = validateSectionKinds([...SECTION_KIND_ORDER, 'routes_and_apis']);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('unexpected routes_and_apis');
  });

  it('rejects a duplicated kind and names it in the reason', () => {
    const result = validateSectionKinds(['architecture', ...SECTION_KIND_ORDER.slice(1), 'architecture']);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('duplicated architecture');
  });
});

describe('(b) isGroundedPath — a path is only ever as trustworthy as the index', () => {
  it('accepts a path present in the index', () => {
    expect(isGroundedPath('src/index.ts', INDEXED_PATHS)).toBe(true);
  });

  it('accepts a directory prefix of an indexed path', () => {
    expect(isGroundedPath('src/modules/onboarding', INDEXED_PATHS)).toBe(true);
  });

  it('rejects a path outside the index', () => {
    expect(isGroundedPath('src/modules/ghost.ts', INDEXED_PATHS)).toBe(false);
  });

  it('rejects an absolute path even when the suffix matches an indexed path', () => {
    expect(isGroundedPath('/etc/passwd', INDEXED_PATHS)).toBe(false);
  });

  it('rejects a path carrying a .. segment', () => {
    expect(isGroundedPath('../etc/passwd', INDEXED_PATHS)).toBe(false);
  });

  it('rejects a URL-encoded separator', () => {
    expect(isGroundedPath('src%2f..%2fetc/passwd', INDEXED_PATHS)).toBe(false);
    expect(isGroundedPath('foo%2f..%2fbar', INDEXED_PATHS)).toBe(false);
  });

  it('rejects a null byte', () => {
    expect(isGroundedPath('src/index.ts\0.md', INDEXED_PATHS)).toBe(false);
  });
});

describe('(c) groundEntries — drop what fails AC-8, keep and count the rest', () => {
  it('keeps grounded entries and drops ungrounded ones, reporting a count and a bounded sample', () => {
    const entries = [
      { path: 'src/index.ts' },
      { path: 'src/ghost-1.ts' },
      { path: 'src/ghost-2.ts' },
      { path: 'README.md' },
    ];
    const result = groundEntries(entries, INDEXED_PATHS, (e) => e.path);
    expect(result.survivors).toEqual([{ path: 'src/index.ts' }, { path: 'README.md' }]);
    expect(result.droppedCount).toBe(2);
    expect(result.droppedSample).toEqual([{ path: 'src/ghost-1.ts' }, { path: 'src/ghost-2.ts' }]);
  });

  it('leaves a section with zero survivors when every entry is ungrounded (AC-10)', () => {
    const result = groundEntries([{ path: 'nope.ts' }], INDEXED_PATHS, (e) => e.path);
    expect(result.survivors).toEqual([]);
    expect(result.droppedCount).toBe(1);
  });
});

describe('(d) reasonNumbersAreGrounded — no fabricated numeric claim', () => {
  it('accepts a number the facts block supplied', () => {
    expect(reasonNumbersAreGrounded('used by 14 routes', new Set(['14']))).toBe(true);
  });

  it('rejects a number the facts block did not supply', () => {
    expect(reasonNumbersAreGrounded('used by 14 routes', new Set(['3']))).toBe(false);
  });

  it('accepts a reason with no numeric claim at all', () => {
    expect(reasonNumbersAreGrounded('the central entrypoint', new Set())).toBe(true);
  });
});

describe('(e) isValidComplexity — the closed three-value set', () => {
  it('accepts low, medium and high', () => {
    expect(isValidComplexity('low')).toBe(true);
    expect(isValidComplexity('medium')).toBe(true);
    expect(isValidComplexity('high')).toBe(true);
  });

  it('rejects a fourth value', () => {
    expect(isValidComplexity('extreme')).toBe(false);
  });
});

describe('(f) applyCaps — bounded arrays, bounded strings, a bounded document', () => {
  it('caps critical_paths, run_locally, reading_path, first_tasks and links to their constants', () => {
    const tour = fiveSectionTour({
      critical_paths: {
        critical_paths: Array.from({ length: MAX_CRITICAL_PATHS + 4 }, (_, i) => ({
          path: `src/f${i}.ts`,
          reason: 'r',
        })),
      },
      run_locally: {
        run_locally: Array.from({ length: MAX_RUN_LOCALLY_STEPS + 4 }, (_, i) => ({ command: `cmd ${i}` })),
      },
      reading_path: {
        reading_path: Array.from({ length: MAX_READING_PATH_STEPS + 4 }, (_, i) => ({
          path: `src/f${i}.ts`,
          rationale: 'r',
        })),
      },
      first_tasks: {
        first_tasks: Array.from({ length: MAX_FIRST_TASKS + 4 }, (_, i) => ({
          title: `task ${i}`,
          hint_path: 'specs',
          complexity: 'low' as const,
        })),
      },
      architecture: { links: Array.from({ length: MAX_LINKS + 4 }, (_, i) => ({ label: `l${i}`, path: 'README.md' })) },
    });

    const capped = applyCaps(tour);
    const byKind = new Map(capped.sections.map((s) => [s.kind, s]));

    expect(byKind.get('critical_paths')?.critical_paths).toHaveLength(MAX_CRITICAL_PATHS);
    expect(byKind.get('run_locally')?.run_locally).toHaveLength(MAX_RUN_LOCALLY_STEPS);
    expect(byKind.get('reading_path')?.reading_path).toHaveLength(MAX_READING_PATH_STEPS);
    expect(byKind.get('first_tasks')?.first_tasks).toHaveLength(MAX_FIRST_TASKS);
    expect(byKind.get('architecture')?.links).toHaveLength(MAX_LINKS);
  });

  it('truncates a single string field over the character cap', () => {
    const tour = fiveSectionTour({
      critical_paths: {
        critical_paths: [{ path: 'src/index.ts', reason: 'x'.repeat(MAX_STRING_CHARS + 50) }],
      },
    });
    const capped = applyCaps(tour);
    const criticalPaths = capped.sections.find((s) => s.kind === 'critical_paths')?.critical_paths;
    expect(criticalPaths?.[0]?.reason).toHaveLength(MAX_STRING_CHARS);
  });

  it('truncates the whole document to the byte ceiling', () => {
    const tour = fiveSectionTour({
      architecture: { body: 'x'.repeat(100_000) },
      critical_paths: { body: 'y'.repeat(100_000) },
    });
    const capped = applyCaps(tour);
    const size = Buffer.byteLength(JSON.stringify(capped), 'utf8');
    expect(size).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
  });

  it('brings an oversized diagram under the document byte ceiling too', () => {
    const tour = fiveSectionTour({
      architecture: { body: 'z'.repeat(20_000), diagram: 'graph TD\n' + 'A-->B\n'.repeat(20_000) },
    });
    const capped = applyCaps(tour);
    const size = Buffer.byteLength(JSON.stringify(capped), 'utf8');
    expect(size).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    const architecture = capped.sections.find((s) => s.kind === 'architecture');
    expect(architecture?.diagram?.length).toBeLessThan('graph TD\n'.length + 'A-->B\n'.repeat(20_000).length);
  });
});

describe('(g) degradedFromIndexStatus — an index that is not full degrades the tour', () => {
  it('a full index does not degrade the tour', () => {
    expect(degradedFromIndexStatus('full')).toEqual({ degraded: false, reason: null });
  });

  it.each(['partial', 'degraded', 'failed'] as const)('%s degrades the tour with a reason', (status) => {
    const result = degradedFromIndexStatus(status);
    expect(result.degraded).toBe(true);
    expect(result.reason).toContain(status);
  });
});

describe('(h) readStoredTour — degrade at read, never throw (AC-47)', () => {
  it('returns a valid stored tour as-is', () => {
    const tour = fiveSectionTour();
    const result = readStoredTour(tour);
    expect(result.degraded).toBe(false);
    expect(result.tour.sections).toHaveLength(5);
  });

  it('tolerates a stored tour that fails the closed-kind validation by degrading rather than throwing', () => {
    const raw = {
      sections: [
        ...SECTION_KIND_ORDER.map((kind) => section({ kind })),
        section({ kind: 'routes_and_apis' as never }),
      ],
      degraded: false,
      degraded_reason: null,
    };
    const result = readStoredTour(raw);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBeTruthy();
    expect(result.tour.degraded).toBe(true);
  });

  it('salvages the sections that parse fine instead of discarding the whole tour (AC-46)', () => {
    const raw = {
      sections: [
        section({ kind: 'architecture' }),
        section({ kind: 'critical_paths' as never }),
        { kind: 'routes_and_apis' as never, title: 'Bogus', body: 'x', links: [] },
        section({ kind: 'run_locally' as never }),
        { title: 'Missing kind entirely', body: 'x', links: [] },
      ],
      degraded: false,
      degraded_reason: null,
    };
    const result = readStoredTour(raw);
    expect(result.degraded).toBe(true);
    expect(result.tour.sections.map((s) => s.kind)).toEqual(['architecture', 'critical_paths', 'run_locally']);
  });
});

describe('(i) isStale — the indexed commit sha alone, indexer_version ignored', () => {
  it('is not stale when the shas match', () => {
    expect(isStale('abc123', 'abc123')).toBe(false);
  });

  it('is stale when the shas differ', () => {
    expect(isStale('abc123', 'def456')).toBe(true);
  });

  it('is not stale when either sha is unknown', () => {
    expect(isStale(null, 'abc123')).toBe(false);
    expect(isStale('abc123', null)).toBe(false);
  });
});
