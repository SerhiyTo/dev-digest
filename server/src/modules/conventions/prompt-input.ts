/**
 * Pure construction of what the two model calls actually see.
 *
 * The line gutter rendered here is what makes the model's reported line numbers
 * meaningful — and therefore checkable by the grounding gate, which recomputes
 * them from the file rather than trusting them.
 */
import { MAX_FILE_CHARS, MAX_TOTAL_FILE_CHARS, TRUNCATION_MARKER } from './constants.js';

export interface PromptFile {
  path: string;
  content: string;
  truncated: boolean;
}

export function renderCandidateList(paths: readonly string[]): string {
  return paths.join('\n');
}

/**
 * Reduce the model's file choice to paths that were actually offered. A path it
 * invented, "corrected" or shortened is discarded; an unusable answer falls back
 * to the head of the candidate list so a bad selection degrades, never fails.
 */
export function filterSelection(
  chosen: readonly string[],
  candidates: readonly string[],
  max: number,
): string[] {
  const offered = new Set(candidates);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const path of chosen) {
    if (!offered.has(path) || seen.has(path)) continue;
    seen.add(path);
    kept.push(path);
    if (kept.length >= max) break;
  }
  return kept.length > 0 ? kept : candidates.slice(0, max);
}

/** Cut at a line boundary so the gutter never renders half a line. */
export function truncateFile(
  content: string,
  maxChars = MAX_FILE_CHARS,
): { content: string; truncated: boolean } {
  if (content.length <= maxChars) return { content, truncated: false };
  const cut = content.slice(0, maxChars);
  const lastBreak = cut.lastIndexOf('\n');
  return { content: lastBreak > 0 ? cut.slice(0, lastBreak) : cut, truncated: true };
}

export function buildPromptFiles(
  entries: readonly (readonly [string, string])[],
  maxFileChars = MAX_FILE_CHARS,
  maxTotalChars = MAX_TOTAL_FILE_CHARS,
): PromptFile[] {
  const files: PromptFile[] = [];
  let total = 0;
  for (const [path, raw] of entries) {
    if (raw.trim() === '') continue;
    const { content, truncated } = truncateFile(raw, maxFileChars);
    if (total + content.length > maxTotalChars && files.length > 0) break;
    files.push({ path, content, truncated });
    total += content.length;
  }
  return files;
}

export function renderNumberedFiles(files: readonly PromptFile[]): string {
  return files.map(renderOneFile).join('\n\n');
}

function renderOneFile(file: PromptFile): string {
  const lines = file.content.split('\n');
  const width = String(lines.length).length;
  const body = lines.map((line, i) => `${String(i + 1).padStart(width, ' ')}| ${line}`).join('\n');
  const marker = file.truncated ? `\n${TRUNCATION_MARKER}` : '';
  return `==== ${file.path} ====\n${body}${marker}`;
}
