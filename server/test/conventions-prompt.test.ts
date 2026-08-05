import { describe, it, expect } from 'vitest';
import {
  buildPromptFiles,
  filterSelection,
  renderCandidateList,
  renderNumberedFiles,
  truncateFile,
} from '../src/modules/conventions/prompt-input.js';
import { TRUNCATION_MARKER } from '../src/modules/conventions/constants.js';

const CANDIDATES = ['src/api/users.ts', 'src/lib/redis.ts', 'src/config.ts'];

describe('filterSelection', () => {
  it('keeps only offered paths, deduped and clamped', () => {
    const chosen = ['src/lib/redis.ts', 'src/lib/redis.ts', 'src/api/users.ts', 'src/config.ts'];

    expect(filterSelection(chosen, CANDIDATES, 2)).toEqual(['src/lib/redis.ts', 'src/api/users.ts']);
  });

  it('discards paths the model invented or shortened', () => {
    const chosen = ['api/users.ts', 'src/api/users.ts', 'src/made-up.ts'];

    expect(filterSelection(chosen, CANDIDATES, 5)).toEqual(['src/api/users.ts']);
  });

  it('falls back to the head of the candidate list when nothing survives', () => {
    expect(filterSelection(['src/nope.ts'], CANDIDATES, 2)).toEqual([
      'src/api/users.ts',
      'src/lib/redis.ts',
    ]);
  });
});

describe('truncateFile', () => {
  it('leaves a short file alone', () => {
    expect(truncateFile('a\nb', 100)).toEqual({ content: 'a\nb', truncated: false });
  });

  it('cuts at a line boundary', () => {
    const { content, truncated } = truncateFile('aaaa\nbbbb\ncccc', 7);

    expect(truncated).toBe(true);
    expect(content).toBe('aaaa');
  });
});

describe('buildPromptFiles', () => {
  it('skips empty files and stops once the total budget is spent', () => {
    const entries = [
      ['a.ts', 'aaaaa'],
      ['blank.ts', '   \n  '],
      ['b.ts', 'bbbbb'],
      ['c.ts', 'ccccc'],
    ] as const;

    const files = buildPromptFiles(entries, 100, 10);

    expect(files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('always keeps at least one file even when it alone exceeds the budget', () => {
    const files = buildPromptFiles([['a.ts', 'aaaaaaaaaa']], 100, 2);

    expect(files.map((f) => f.path)).toEqual(['a.ts']);
  });
});

describe('renderNumberedFiles', () => {
  it('renders a 1-based right-aligned gutter under a path header', () => {
    const rendered = renderNumberedFiles(
      buildPromptFiles([['src/a.ts', 'const a = 1;\nconst b = 2;']]),
    );

    expect(rendered).toBe('==== src/a.ts ====\n1| const a = 1;\n2| const b = 2;');
  });

  it('keeps numbering correct after truncation and marks it unnumbered', () => {
    const rendered = renderNumberedFiles(buildPromptFiles([['src/a.ts', 'aaaa\nbbbb\ncccc']], 7));

    expect(rendered).toBe(`==== src/a.ts ====\n1| aaaa\n${TRUNCATION_MARKER}`);
  });
});

describe('renderCandidateList', () => {
  it('is one path per line', () => {
    expect(renderCandidateList(CANDIDATES)).toBe(CANDIDATES.join('\n'));
  });
});
