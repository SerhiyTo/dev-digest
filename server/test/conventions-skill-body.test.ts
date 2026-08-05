import { describe, it, expect } from 'vitest';
import {
  buildSkillBody,
  conventionSlug,
  evidenceFilesOf,
  fenceLang,
  ruleSectionSlug,
  skillDescription,
  type DraftConvention,
} from '../src/modules/conventions/skill-body.js';

const ASYNC: DraftConvention = {
  rule: 'Always use async/await instead of .then() chains.',
  evidence: [
    {
      path: 'src/api/users.ts',
      start_line: 23,
      end_line: 31,
      snippet: 'const user = await db.users.find(id);',
    },
  ],
};

const REDIS: DraftConvention = {
  rule: 'Redis access goes through src/lib/redis.ts singleton',
  evidence: [
    {
      path: 'src/lib/redis.ts',
      start_line: 1,
      end_line: 1,
      snippet: 'export const redis = new Redis(config.redisUrl);',
    },
    {
      path: 'src/api/users.ts',
      start_line: 9,
      end_line: 10,
      snippet: "import { redis } from '../lib/redis';",
    },
  ],
};

describe('conventionSlug / skillDescription', () => {
  it('derives the skill name from the repo name', () => {
    expect(conventionSlug('payments-api')).toBe('payments-api-conventions');
    expect(conventionSlug('Payments API')).toBe('payments-api-conventions');
  });

  it('describes the merge with a correctly pluralised count', () => {
    expect(skillDescription('payments-api', 3)).toBe(
      '3 house conventions extracted from payments-api',
    );
    expect(skillDescription('payments-api', 1)).toBe(
      '1 house convention extracted from payments-api',
    );
  });
});

describe('ruleSectionSlug', () => {
  it('kebab-cases the first few words and de-duplicates collisions', () => {
    const taken = new Set<string>();

    expect(ruleSectionSlug('Always use async/await instead of .then() chains.', taken)).toBe(
      'always-use-async-await-instead-of',
    );
    expect(ruleSectionSlug('Always use async/await instead of promises.', taken)).toBe(
      'always-use-async-await-instead-of-2',
    );
  });

  it('falls back for a rule with no usable words', () => {
    expect(ruleSectionSlug('!!! ???', new Set())).toBe('convention');
  });
});

describe('buildSkillBody', () => {
  it('renders the heading, intro and one section per convention', () => {
    const body = buildSkillBody('payments-api-conventions', 'payments-api', [ASYNC]);

    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('House conventions for `payments-api`.');
    expect(body).toContain('## always-use-async-await-instead-of');
    expect(body).toContain('Detected in `src/api/users.ts:23-31`:');
    expect(body).toContain('```ts\nconst user = await db.users.find(id);\n```');
  });

  it('labels a single-line citation without a range, and extra citations as "Also in"', () => {
    const body = buildSkillBody('payments-api-conventions', 'payments-api', [REDIS]);

    expect(body).toContain('Detected in `src/lib/redis.ts:1`:');
    expect(body).toContain('Also in `src/api/users.ts:9-10`:');
  });

  it('escalates the fence past a backtick run inside the snippet', () => {
    const body = buildSkillBody('x-conventions', 'x', [
      {
        rule: 'Document every exported helper with a fenced example.',
        evidence: [
          {
            path: 'src/doc.md',
            start_line: 1,
            end_line: 3,
            snippet: '```ts\nconst a = 1;\n```',
          },
        ],
      },
    ]);

    expect(body).toContain('````md\n```ts\nconst a = 1;\n```\n````');
  });
});

describe('evidenceFilesOf', () => {
  it('is unique and ordered by first appearance', () => {
    expect(evidenceFilesOf([ASYNC, REDIS])).toEqual(['src/api/users.ts', 'src/lib/redis.ts']);
  });
});

describe('fenceLang', () => {
  it('maps known extensions and stays empty for unknown ones', () => {
    expect(fenceLang('src/a.tsx')).toBe('tsx');
    expect(fenceLang('Makefile')).toBe('');
  });
});
