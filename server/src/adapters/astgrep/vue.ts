/**
 * Vue SFC → embedded-script extraction.
 *
 * `@ast-grep/napi@0.43.0` has no `Lang.Vue` (its enum is `Html, JavaScript,
 * Tsx, Css, TypeScript`), and `parseSymbols`/`parseReferences` only walk
 * top-level `root.children()`, so an HTML grammar would not reach
 * declarations inside `<script>` even if one existed. We therefore never hand
 * ast-grep raw `.vue` text: we extract each script block's *text* with
 * `@vue/compiler-sfc` and parse that text with the ordinary TS/TSX/JS
 * grammar, then shift every emitted line back into file-absolute coordinates
 * at the call site.
 *
 * `descriptor.script` and `descriptor.scriptSetup` are extracted and returned
 * SEPARATELY, each carrying its own line offset — concatenating them (what
 * dependency-cruiser does internally for its own import-only needs) would
 * destroy line correctness for whichever block is not first.
 *
 * `compileScript` is deliberately NOT used here: it macro-expands
 * `defineProps`/`defineEmits` and returns transformed text bound to a
 * generated source map, which would need a source-map round trip to recover
 * original line numbers. Plain `parse()` keeps each block's source text
 * byte-for-byte, so the shift back to file coordinates is a flat integer add.
 */
import { parse as parseSFC } from '@vue/compiler-sfc';
import { Lang } from '@ast-grep/napi';

export interface VueScriptBlock {
  lang: Lang;
  content: string;
  /**
   * `block.loc.start.line` from `@vue/compiler-sfc` is FILE-ABSOLUTE and
   * 1-based already (it is computed against the whole `.vue` source, not the
   * block alone). ast-grep's own line-reporting helpers in this adapter are
   * also already 1-based (0-based range + 1). So recovering the original
   * file line from a line found inside `content` is a flat add, no byte
   * counting and no source map:
   *
   *   originalLine = astGrepLine + lineOffset
   *   lineOffset   = block.loc.start.line - 1
   */
  lineOffset: number;
}

function langForBlockAttr(lang: string | undefined): Lang {
  switch (lang) {
    case 'ts':
      return Lang.TypeScript;
    case 'tsx':
    case 'jsx':
      return Lang.Tsx;
    default:
      return Lang.JavaScript;
  }
}

/**
 * Extract the `<script>` and `<script setup>` blocks (a file may carry
 * both) as independently-parseable text + the offset needed to translate
 * lines found in that text back to the original `.vue` file.
 *
 * Best-effort per this module's contract: a parse throw or any entry in
 * `errors` degrades to `[]` rather than propagating — a malformed SFC must
 * not abort the caller's walk.
 */
export function parseVueScriptBlocks(file: string, source: string): VueScriptBlock[] {
  let descriptor: ReturnType<typeof parseSFC>['descriptor'];
  let errors: ReturnType<typeof parseSFC>['errors'];
  try {
    ({ descriptor, errors } = parseSFC(source, { filename: file }));
  } catch {
    return [];
  }
  if (errors.length > 0) return [];

  const blocks: VueScriptBlock[] = [];
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue;
    blocks.push({
      lang: langForBlockAttr(block.lang),
      content: block.content,
      lineOffset: block.loc.start.line - 1,
    });
  }
  return blocks;
}
