import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { assembleProjectContext, mergeAttachments } from '../src/modules/context/assemble.js';

/**
 * AC-21: skill-attached and agent-attached documents serialise into ONE
 * `## Project context` block, at full text, with no separate section for the
 * skill's contribution.
 *
 * The plan's coverage table points this criterion at `context-assemble.test.ts`,
 * which never renders a prompt and therefore cannot see a section boundary. The
 * only other observation is `reviews-context.it.test.ts`, which needs Docker and
 * is skipped whenever the `docker info` probe loses its race. This composes the
 * server's merge + assembly with reviewer-core's renderer in the unit lane.
 */

const AGENT_ONLY = 'specs/agent-only.md';
const SHARED = 'docs/shared.md';
const SKILL_ONLY = 'plans/skill-only.md';

const BODIES: Record<string, string> = {
  [AGENT_ONLY]: '# Agent only\n\nThe reviewer agent attached this document directly.',
  [SHARED]: '# Shared\n\nBoth the agent and one of its linked skills attached this.',
  [SKILL_ONLY]: '# Skill only\n\nOnly a linked skill attached this document.',
};

const BASE = { system: 'You are a reviewer.', diff: '+++ b/a.ts\n+const a = 1;' };

function renderRun(agentPaths: string[], skillPathsInLinkOrder: string[]) {
  const merged = mergeAttachments(agentPaths, skillPathsInLinkOrder);
  const assembled = assembleProjectContext(
    merged.map((path) => ({ path, text: BODIES[path] ?? '' })),
  );
  const { assembly } = assemblePrompt({ ...BASE, specs: assembled.specs });
  return { assembled, assembly };
}

function projectContextSection(user: string): string {
  const start = user.indexOf('## Project context');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = user.indexOf('\n## ', start + 1);
  return end === -1 ? user.slice(start) : user.slice(start, end);
}

describe('agent- and skill-attached documents share one prompt section (AC-21)', () => {
  it('emits a single ## Project context block holding every contributor at full text', () => {
    const { assembled, assembly } = renderRun(
      [AGENT_ONLY, SHARED],
      [SHARED, SKILL_ONLY],
    );

    expect(assembled.specsRead).toEqual([AGENT_ONLY, SHARED, SKILL_ONLY]);
    expect(assembly.user.split('## Project context')).toHaveLength(2);

    const section = projectContextSection(assembly.user);
    for (const path of [AGENT_ONLY, SHARED, SKILL_ONLY]) {
      expect(section).toContain(`${path}\n\n${BODIES[path]}`);
    }
  });

  it('keeps the skill-only document inside that block rather than in a section of its own', () => {
    const { assembly } = renderRun([AGENT_ONLY], [SKILL_ONLY]);

    const section = projectContextSection(assembly.user);
    expect(section).toContain(BODIES[SKILL_ONLY]);
    expect(assembly.user.indexOf(BODIES[SKILL_ONLY]!)).toBeLessThan(
      assembly.user.indexOf('## Diff to review'),
    );

    const headings = assembly.user.match(/^## .+$/gm) ?? [];
    expect(headings.filter((h) => h.toLowerCase().includes('context'))).toEqual([
      '## Project context',
    ]);
    expect(assembly.specs).toContain(BODIES[SKILL_ONLY]);
  });

  it('orders the block agent-first, then linked skills, with a shared path at its first position', () => {
    const { assembly } = renderRun([AGENT_ONLY, SHARED], [SHARED, SKILL_ONLY]);
    const section = projectContextSection(assembly.user);

    expect(section.indexOf(AGENT_ONLY)).toBeLessThan(section.indexOf(SHARED));
    expect(section.indexOf(SHARED)).toBeLessThan(section.indexOf(SKILL_ONLY));
    expect(section.split(BODIES[SHARED]!)).toHaveLength(2);
  });

  it('produces the same block whichever side contributed a document, given the same merge order', () => {
    const fromTheAgent = renderRun([AGENT_ONLY, SHARED, SKILL_ONLY], []);
    const fromTheSkills = renderRun([], [AGENT_ONLY, SHARED, SKILL_ONLY]);

    expect(fromTheSkills.assembly.user).toBe(fromTheAgent.assembly.user);
    expect(fromTheSkills.assembly.specs).toBe(fromTheAgent.assembly.specs);
  });
});
