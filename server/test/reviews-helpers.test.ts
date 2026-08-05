import { describe, it, expect } from 'vitest';
import { taskLine, renderSkillBlocks } from '../src/modules/reviews/helpers.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

function makeLink(name: string, body: string, enabled: boolean, order: number): LinkedSkillRow {
  return {
    order,
    skill: { name, body, enabled } as never,
  };
}

describe('renderSkillBlocks', () => {
  it('preserves link order across enabled skills', () => {
    const links = [
      makeLink('first', 'first body', true, 0),
      makeLink('second', 'second body', true, 1),
      makeLink('third', 'third body', true, 2),
    ];

    const blocks = renderSkillBlocks(links);

    expect(blocks).toEqual([
      '### first\nfirst body',
      '### second\nsecond body',
      '### third\nthird body',
    ]);
  });

  it('filters out disabled links without disturbing survivor order', () => {
    const links = [
      makeLink('alpha', 'alpha body', true, 0),
      makeLink('beta', 'beta body', false, 1),
      makeLink('gamma', 'gamma body', true, 2),
    ];

    const blocks = renderSkillBlocks(links);

    expect(blocks).toEqual(['### alpha\nalpha body', '### gamma\ngamma body']);
  });

  it('returns [] when every link is disabled', () => {
    const links = [
      makeLink('alpha', 'alpha body', false, 0),
      makeLink('beta', 'beta body', false, 1),
    ];

    expect(renderSkillBlocks(links)).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(renderSkillBlocks([])).toEqual([]);
  });

  it('renders the exact shape: "### <name>" then a newline then the body', () => {
    const blocks = renderSkillBlocks([makeLink('mock-overuse-gate', 'Flag over-mocked tests.', true, 0)]);

    expect(blocks).toEqual(['### mock-overuse-gate\nFlag over-mocked tests.']);
  });
});
