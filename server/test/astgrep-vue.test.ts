import { describe, it, expect } from 'vitest';
import {
  parseSymbols,
  parseReferences,
  parseImports,
  langForFile,
} from '../src/adapters/astgrep/index.js';

/**
 * T2.3 — Vue SFC support in the astgrep adapter.
 *
 * `.vue` has no single `Lang`, so `langForFile('x.vue')` stays `null` on
 * purpose (T2.2's doc comment); `parseSymbols`/`parseReferences`/
 * `parseImports` branch on the extension internally instead and shift lines
 * from block-local back to file-absolute. The line-offset assertion below is
 * the one that guards the hard part — it pins a real line number, not just
 * "greater than zero".
 */
describe('Vue SFC — langForFile stays null', () => {
  it('does not claim a single Lang for .vue', () => {
    expect(langForFile('Widget.vue')).toBeNull();
  });
});

describe('Vue SFC — <script setup lang="ts">', () => {
  const src = [
    '<template>',
    '  <div>{{ count }}</div>',
    '</template>',
    '',
    '<script setup lang="ts">',
    'import { useLocalThing } from "./composables/useLocalThing"',
    '',
    'export function computeDoubled(n: number): number {',
    '  return n * 2;',
    '}',
    '',
    'const thing = useLocalThing();',
    'const doubled = computeDoubled(3);',
    '</script>',
    '',
  ].join('\n');

  it('reports a symbol declared inside <script setup> at its real file line', () => {
    const symbols = parseSymbols('Widget.vue', src);
    const fn = symbols.find((s) => s.name === 'computeDoubled');
    expect(fn).toBeDefined();
    // Line 8 in the joined `src` above (1-based) — asserted as a real number,
    // not `toBeGreaterThan(0)`, per the plan: this is the line-offset guard.
    expect(fn!.line).toBe(8);
    expect(fn!.exported).toBe(true);
  });

  it('reports references at file-absolute lines with the right kind', () => {
    const refs = parseReferences('Widget.vue', src);
    const doubledCall = refs.find((r) => r.toSymbol === 'computeDoubled');
    expect(doubledCall).toBeDefined();
    expect(doubledCall!.line).toBe(13);
    expect(doubledCall!.kind).toBe('call');
    expect(doubledCall!.refFile).toBe('Widget.vue');
  });

  it('resolves imports from the script-setup block', () => {
    const imports = parseImports('Widget.vue', src);
    expect(imports.some((i) => i.name === 'useLocalThing' && i.source === './composables/useLocalThing')).toBe(true);
  });
});

describe('Vue SFC — plain <script lang="ts"> (no setup)', () => {
  const src = [
    '<script lang="ts">',
    'export default {',
    '  name: "Widget",',
    '};',
    '',
    'export function plainHelper(x: number): number {',
    '  return x + 1;',
    '}',
    '</script>',
    '<template><div /></template>',
    '',
  ].join('\n');

  it('parses declarations from a plain (non-setup) script block', () => {
    const symbols = parseSymbols('Plain.vue', src);
    const fn = symbols.find((s) => s.name === 'plainHelper');
    expect(fn).toBeDefined();
    expect(fn!.line).toBe(6);
  });
});

describe('Vue SFC — both <script> and <script setup> present', () => {
  const src = [
    '<script lang="ts">',
    'export function fromScript(): number {',
    '  return 1;',
    '}',
    '</script>',
    '',
    '<script setup lang="ts">',
    'export function fromSetup(): number {',
    '  return 2;',
    '}',
    'const a = fromScript();',
    'const b = fromSetup();',
    '</script>',
    '',
  ].join('\n');

  it('parses each block independently with its own offset — no concatenation', () => {
    const symbols = parseSymbols('Both.vue', src);
    const fromScript = symbols.find((s) => s.name === 'fromScript');
    const fromSetup = symbols.find((s) => s.name === 'fromSetup');
    expect(fromScript).toBeDefined();
    expect(fromSetup).toBeDefined();
    // Real file lines, not the line each decl would have had if the two
    // blocks were naively concatenated into one source string.
    expect(fromScript!.line).toBe(2);
    expect(fromSetup!.line).toBe(8);

    const refs = parseReferences('Both.vue', src);
    const callToScript = refs.find((r) => r.toSymbol === 'fromScript');
    const callToSetup = refs.find((r) => r.toSymbol === 'fromSetup');
    expect(callToScript!.line).toBe(11);
    expect(callToSetup!.line).toBe(12);
  });
});

describe('Vue SFC — no script block', () => {
  const src = '<template>\n  <div>static</div>\n</template>\n';

  it('degrades to empty rather than throwing', () => {
    expect(parseSymbols('Static.vue', src)).toEqual([]);
    expect(parseReferences('Static.vue', src)).toEqual([]);
    expect(parseImports('Static.vue', src)).toEqual([]);
  });
});

describe('Vue SFC — malformed source', () => {
  it('degrades to empty rather than throwing', () => {
    const malformed = '<script setup lang="ts">\n  const x = {{{{\n</template>';
    expect(() => parseSymbols('Broken.vue', malformed)).not.toThrow();
    expect(() => parseReferences('Broken.vue', malformed)).not.toThrow();
    expect(() => parseImports('Broken.vue', malformed)).not.toThrow();
    expect(parseSymbols('Broken.vue', malformed)).toEqual([]);
  });
});
