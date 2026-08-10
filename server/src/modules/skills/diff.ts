import { createTwoFilesPatch, OMIT_HEADERS } from 'diff';

const NO_NEWLINE_MARKER = '\\ No newline at end of file';
const HUNK_HEADER_PREFIX = '@@';

/**
 * Unified diff of two skill bodies as **hunks only** — no `---`/`+++` file
 * headers and no `\ No newline at end of file` markers. The consumer renders
 * this through a parser that classifies every line by its first character, so
 * anything outside a hunk is not metadata to it: a header would paint as a
 * red/green line, and the newline marker would additionally desynchronise the
 * line numbering for the rest of the hunk. The caller already knows which two
 * versions it is comparing and labels them in its own chrome.
 *
 * Equal bodies yield the empty string rather than a header-only patch. These
 * patches are for reading, never for `applyPatch`.
 */
export function skillBodyPatch(oldBody: string, newBody: string): string {
  const patch = createTwoFilesPatch('', '', oldBody, newBody, undefined, undefined, {
    headerOptions: OMIT_HEADERS,
  });
  const lines = patch.split('\n').filter((line) => line !== NO_NEWLINE_MARKER);
  if (!lines.some((line) => line.startsWith(HUNK_HEADER_PREFIX))) return '';
  return lines.join('\n');
}
