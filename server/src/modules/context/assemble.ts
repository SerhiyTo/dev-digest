import { MAX_BLOCK_CHARS, MAX_DOC_CHARS, TRUNCATION_MARKER } from './constants.js';
import { sanitizePathLabel } from './paths.js';

export interface ProjectDocEntry {
  path: string;
  text: string;
}

export type ProjectDocSkipReason = 'empty' | 'block_budget';

export interface SkippedProjectDoc {
  path: string;
  reason: ProjectDocSkipReason;
}

export interface AssembledProjectContext {
  specs: string[];
  specsRead: string[];
  skipped: SkippedProjectDoc[];
}

export function mergeAttachments(
  agentPaths: readonly string[],
  skillPathsInLinkOrder: readonly string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const path of [...agentPaths, ...skillPathsInLinkOrder]) {
    if (seen.has(path)) continue;
    seen.add(path);
    merged.push(path);
  }
  return merged;
}

function withMarker(body: string, keptChars: number): string {
  return `${body.slice(0, keptChars)}\n${TRUNCATION_MARKER}`;
}

function fitBody(body: string, available: number): string | null {
  const capped = body.length <= MAX_DOC_CHARS ? body : withMarker(body, MAX_DOC_CHARS);
  if (capped.length <= available) return capped;

  const keptChars = available - TRUNCATION_MARKER.length - 1;
  if (keptChars < 1) return null;
  return withMarker(body, keptChars);
}

export function assembleProjectContext(
  entries: readonly ProjectDocEntry[],
): AssembledProjectContext {
  const specs: string[] = [];
  const specsRead: string[] = [];
  const skipped: SkippedProjectDoc[] = [];
  let used = 0;

  for (const entry of entries) {
    const body = entry.text.trim();
    if (body.length === 0) {
      skipped.push({ path: entry.path, reason: 'empty' });
      continue;
    }

    const heading = `${sanitizePathLabel(entry.path)}\n\n`;
    const fitted = fitBody(body, MAX_BLOCK_CHARS - used - heading.length);
    if (fitted === null) {
      skipped.push({ path: entry.path, reason: 'block_budget' });
      continue;
    }

    const spec = `${heading}${fitted}`;
    specs.push(spec);
    specsRead.push(entry.path);
    used += spec.length;
  }

  return { specs, specsRead, skipped };
}
