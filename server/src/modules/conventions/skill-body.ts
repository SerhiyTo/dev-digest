/**
 * Generates the skill draft from accepted conventions.
 *
 * The preview the user edits and the body that is saved come from this one
 * function, so they cannot disagree.
 */
import { extname } from 'node:path';
import {
  FENCE_LANG_BY_EXT,
  MAX_SECTION_SLUG_CHARS,
  SECTION_SLUG_WORDS,
  SKILL_SLUG_SUFFIX,
} from './constants.js';
import type { GroundedEvidence } from './grounding.js';

export interface DraftConvention {
  rule: string;
  evidence: GroundedEvidence[];
}

export function conventionSlug(repoName: string): string {
  const base = kebab(repoName);
  return base === '' ? SKILL_SLUG_SUFFIX : `${base}-${SKILL_SLUG_SUFFIX}`;
}

export function skillDescription(repoName: string, count: number): string {
  const noun = count === 1 ? 'house convention' : 'house conventions';
  return `${count} ${noun} extracted from ${repoName}`;
}

export function ruleSectionSlug(rule: string, taken: Set<string>): string {
  const words = kebab(rule).split('-').filter(Boolean).slice(0, SECTION_SLUG_WORDS);
  const base = (words.join('-') || 'convention').slice(0, MAX_SECTION_SLUG_CHARS);
  let slug = base;
  let suffix = 2;
  while (taken.has(slug)) slug = `${base}-${suffix++}`;
  taken.add(slug);
  return slug;
}

export function evidenceFilesOf(conventions: readonly DraftConvention[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const convention of conventions) {
    for (const entry of convention.evidence) {
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      paths.push(entry.path);
    }
  }
  return paths;
}

export function buildSkillBody(
  name: string,
  repoName: string,
  conventions: readonly DraftConvention[],
): string {
  const taken = new Set<string>();
  const sections = conventions.map((convention) => renderSection(convention, taken));
  const intro = `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  return [`# ${name}`, '', intro, '', ...sections].join('\n').trimEnd() + '\n';
}

function renderSection(convention: DraftConvention, taken: Set<string>): string {
  const lines = [`## ${ruleSectionSlug(convention.rule, taken)}`, convention.rule, ''];
  convention.evidence.forEach((entry, index) => {
    const lead = index === 0 ? 'Detected in' : 'Also in';
    lines.push(`${lead} \`${entry.path}:${lineLabel(entry)}\`:`, '');
    lines.push(renderFence(entry.snippet, entry.path), '');
  });
  return lines.join('\n');
}

function lineLabel(entry: GroundedEvidence): string {
  return entry.start_line === entry.end_line
    ? String(entry.start_line)
    : `${entry.start_line}-${entry.end_line}`;
}

/** Open past any backtick run inside the snippet, so code fences cannot break out. */
function renderFence(snippet: string, path: string): string {
  const longestRun = Math.max(0, ...[...snippet.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}${fenceLang(path)}\n${snippet}\n${fence}`;
}

export function fenceLang(path: string): string {
  return FENCE_LANG_BY_EXT[extname(path).toLowerCase()] ?? '';
}

function kebab(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
