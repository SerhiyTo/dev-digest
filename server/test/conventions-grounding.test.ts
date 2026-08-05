import { describe, it, expect } from 'vitest';
import {
  groundConventions,
  normaliseRule,
  DROP_DUPLICATE_RULE,
  DROP_RULE_LENGTH,
  DROP_SNIPPET_NOT_FOUND,
  DROP_SNIPPET_TOO_LONG,
  DROP_UNKNOWN_PATH,
  type RawConvention,
} from '../src/modules/conventions/grounding.js';

const USERS_TS = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

const files = new Map([['src/api/users.ts', USERS_TS]]);

function convention(over: Partial<RawConvention> = {}): RawConvention {
  return {
    rule: 'Always use async/await instead of .then() chains.',
    confidence: 0.9,
    evidence: [
      {
        path: 'src/api/users.ts',
        start_line: 1,
        end_line: 2,
        snippet: '  const user = await db.users.find(id);',
      },
    ],
    ...over,
  };
}

describe('groundConventions', () => {
  it('keeps a verified citation and recomputes its line numbers from the file', () => {
    const { kept, dropped } = groundConventions([convention()], files);

    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.evidence[0]).toMatchObject({
      path: 'src/api/users.ts',
      start_line: 4,
      end_line: 4,
    });
  });

  it('tolerates re-indentation but still anchors to the real lines', () => {
    const reindented = convention({
      evidence: [
        {
          path: 'src/api/users.ts',
          start_line: 99,
          end_line: 99,
          snippet: 'const   user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
        },
      ],
    });

    const { kept } = groundConventions([reindented], files);

    expect(kept[0]!.evidence[0]).toMatchObject({ start_line: 4, end_line: 5 });
  });

  it('drops a fabricated snippet and an invented path with distinct reasons', () => {
    const fabricated = convention({
      rule: 'Every handler validates its input with zod.',
      evidence: [
        {
          path: 'src/api/users.ts',
          start_line: 1,
          end_line: 1,
          snippet: 'const parsed = UserSchema.parse(req.body);',
        },
      ],
    });
    const invented = convention({
      rule: 'Redis access goes through a single shared client.',
      evidence: [
        { path: 'src/lib/redis.ts', start_line: 1, end_line: 1, snippet: 'export const redis = 1;' },
      ],
    });

    const { kept, dropped } = groundConventions([fabricated, invented], files);

    expect(kept).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual([DROP_SNIPPET_NOT_FOUND, DROP_UNKNOWN_PATH]);
  });

  it('keeps a rule whose other citation verifies, dropping only the bad entry', () => {
    const mixed = convention({
      evidence: [
        { path: 'src/nope.ts', start_line: 1, end_line: 1, snippet: 'whatever' },
        {
          path: 'src/api/users.ts',
          start_line: 1,
          end_line: 1,
          snippet: '  return { user, posts };',
        },
      ],
    });

    const { kept, dropped } = groundConventions([mixed], files);

    expect(dropped).toEqual([]);
    expect(kept[0]!.evidence).toHaveLength(1);
    expect(kept[0]!.evidence[0]!.start_line).toBe(6);
  });

  it('rejects a rule that is too short and a snippet that is too long', () => {
    const tooShort = convention({ rule: 'short' });
    const tooLong = convention({
      rule: 'Handlers return a typed Result envelope rather than throwing.',
      evidence: [
        {
          path: 'src/api/users.ts',
          start_line: 1,
          end_line: 40,
          snippet: Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'),
        },
      ],
    });

    const { kept, dropped } = groundConventions([tooShort, tooLong], files);

    expect(kept).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual([DROP_RULE_LENGTH, DROP_SNIPPET_TOO_LONG]);
  });

  it('collapses duplicate rules, keeping the higher confidence one', () => {
    const low = convention({ confidence: 0.4 });
    const high = convention({ rule: 'ALWAYS use async/await, instead of .then() chains!', confidence: 0.95 });

    const { kept, dropped } = groundConventions([low, high], files);

    expect(kept).toHaveLength(1);
    expect(kept[0]!.confidence).toBe(0.95);
    expect(dropped).toEqual([{ rule: low.rule, reason: DROP_DUPLICATE_RULE }]);
  });

  it('clamps confidence into [0,1]', () => {
    const { kept } = groundConventions([convention({ confidence: 4.2 })], files);

    expect(kept[0]!.confidence).toBe(1);
  });
});

describe('normaliseRule', () => {
  it('ignores case and punctuation so re-phrased duplicates collide', () => {
    expect(normaliseRule('Use async/await!')).toBe(normaliseRule('use ASYNC await'));
  });
});
