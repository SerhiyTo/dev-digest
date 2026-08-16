import { describe, it, expect } from 'vitest';
import {
  parseSymbols,
  parseReferences,
  parseImports,
  langForFile,
} from '../src/adapters/astgrep/index.js';
import { MAX_SIGNATURE_CHARS } from '../src/modules/repo-intel/constants.js';

/**
 * T1.2 — unit tests for the @ast-grep/napi adapter.
 *
 * Pure (in-memory parse, no DB / Docker / network). The fixtures cover the
 * shapes blast-radius + phantom-gate care about: exported decls with usable
 * signatures, call/new/JSX references with correct line numbers, and
 * import-binding extraction (T1.3's "declared-or-imported" set).
 */
describe('langForFile (extension → Lang)', () => {
  it('maps known TS/JSX/JS extensions and rejects others', () => {
    expect(langForFile('src/a.ts')).toBeTruthy();
    expect(langForFile('src/a.tsx')).toBeTruthy();
    expect(langForFile('src/a.jsx')).toBeTruthy();
    expect(langForFile('src/a.js')).toBeTruthy();
    expect(langForFile('src/a.cjs')).toBeTruthy();
    expect(langForFile('src/a.mjs')).toBeTruthy();
    expect(langForFile('src/a.py')).toBeNull();
    expect(langForFile('README.md')).toBeNull();
    // Case-insensitive extension match
    expect(langForFile('src/a.TS')).toBeTruthy();
  });
});

describe('parseSymbols', () => {
  it('finds exported function/arrow/class/method/interface/type/enum with signatures', () => {
    const src = `
export function rateLimit(req: Request): boolean { return true; }
function internal(x: number) { return x; }
export const compute = async (n: number): Promise<number> => n * 2;
const helper = (x: number) => x + 1;
export class Bucket {
  refill(now: number): number { return now; }
  static make(): Bucket { return new Bucket(); }
}
export interface Config { port: number }
export type Id = string;
export enum Color { RED, BLUE }
`;
    const syms = parseSymbols('src/x.ts', src);
    const names = syms.map((s) => s.name);

    expect(names).toContain('rateLimit');
    expect(names).toContain('internal');
    expect(names).toContain('compute');
    expect(names).toContain('helper');
    expect(names).toContain('Bucket');
    expect(names).toContain('refill');           // bare method
    expect(names).toContain('Bucket.refill');    // qualified method
    expect(names).toContain('make');
    expect(names).toContain('Bucket.make');
    expect(names).toContain('Config');
    expect(names).toContain('Id');
    expect(names).toContain('Color');

    const rateLimit = syms.find((s) => s.name === 'rateLimit')!;
    expect(rateLimit.exported).toBe(true);
    expect(rateLimit.kind).toBe('function');
    expect(rateLimit.signature).toContain('rateLimit');
    expect(rateLimit.signature).toContain('Request');
    expect(rateLimit.line).toBe(2);
    expect(rateLimit.endLine).toBeGreaterThanOrEqual(rateLimit.line);

    const internal = syms.find((s) => s.name === 'internal')!;
    expect(internal.exported).toBe(false);

    const compute = syms.find((s) => s.name === 'compute')!;
    expect(compute.exported).toBe(true);
    expect(compute.kind).toBe('function');
    expect(compute.signature).toContain('compute');

    const bucket = syms.find((s) => s.name === 'Bucket')!;
    expect(bucket.kind).toBe('class');
    expect(bucket.exported).toBe(true);
    expect(bucket.signature).toContain('Bucket');

    const refill = syms.find((s) => s.name === 'Bucket.refill')!;
    expect(refill.kind).toBe('method');
    expect(refill.signature).toContain('refill');

    expect(syms.find((s) => s.name === 'Config')?.kind).toBe('interface');
    expect(syms.find((s) => s.name === 'Id')?.kind).toBe('type');
    expect(syms.find((s) => s.name === 'Color')?.kind).toBe('enum');
  });

  it('handles `export default class` and `export { X }` re-exports', () => {
    const src = `
class Hidden {}
function local() { return 1; }
export { local as exposed, Hidden };
export default class Defaulted {}
`;
    const syms = parseSymbols('src/x.ts', src);
    expect(syms.find((s) => s.name === 'Defaulted')?.exported).toBe(true);
    // re-export pass marks the local decls as exported
    const local = syms.find((s) => s.name === 'local');
    const hidden = syms.find((s) => s.name === 'Hidden');
    expect(local?.exported).toBe(true);
    expect(hidden?.exported).toBe(true);
  });

  it('trims signatures to MAX_SIGNATURE_CHARS', () => {
    const longTypeParams = 'A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X';
    const longArgs = 'a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number';
    const src = `export function wide<${longTypeParams}>(${longArgs}): void {}\n`;
    const sig = parseSymbols('src/x.ts', src).find((s) => s.name === 'wide')?.signature ?? '';
    expect(sig.length).toBeLessThanOrEqual(MAX_SIGNATURE_CHARS);
  });

  it('returns [] for unsupported extensions', () => {
    expect(parseSymbols('src/x.py', 'def foo(): pass')).toEqual([]);
  });

  it('parses .tsx as JSX-aware TypeScript', () => {
    const src = `
import { useState } from 'react';
export function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
`;
    const syms = parseSymbols('src/Counter.tsx', src);
    const counter = syms.find((s) => s.name === 'Counter');
    expect(counter).toBeDefined();
    expect(counter!.exported).toBe(true);
    expect(counter!.kind).toBe('function');
  });
});

describe('parseReferences', () => {
  it('finds call sites, member calls, new, and JSX usage with correct line numbers', () => {
    const src = `
import { rateLimit, Bucket, Widget } from './mw';
export function handler(req) {
  if (!rateLimit(req)) return 429;
  const b = new Bucket();
  obj.compute(1);
  return <Widget id={1} />;
}
`;
    const refs = parseReferences('src/h.tsx', src);

    const rateRef = refs.find((r) => r.toSymbol === 'rateLimit');
    expect(rateRef).toBeDefined();
    expect(rateRef!.line).toBe(4);
    expect(rateRef!.refFile).toBe('src/h.tsx');

    expect(refs.find((r) => r.toSymbol === 'Bucket')?.line).toBe(5);
    expect(refs.find((r) => r.toSymbol === 'compute')?.line).toBe(6);
    expect(refs.find((r) => r.toSymbol === 'Widget')?.line).toBe(7);

    // import-line bindings are NOT references
    expect(refs.find((r) => r.line === 2)).toBeUndefined();
  });

  it('does not count the declaration line as a reference', () => {
    const src = `export function rateLimit(req) { return true; }\n`;
    const refs = parseReferences('src/x.ts', src);
    expect(refs.find((r) => r.toSymbol === 'rateLimit')).toBeUndefined();
  });

  it('skips lowercase HTML tags', () => {
    const src = `export const A = () => <div className="x">hi</div>;\n`;
    const refs = parseReferences('src/A.tsx', src);
    expect(refs.find((r) => r.toSymbol === 'div')).toBeUndefined();
  });

  it('tags call/new/JSX references with kind "call"', () => {
    const src = `
export function handler(req) {
  if (!rateLimit(req)) return 429;
  const b = new Bucket();
  return <Widget id={1} />;
}
`;
    const refs = parseReferences('src/h.tsx', src);
    expect(refs.find((r) => r.toSymbol === 'rateLimit')?.kind).toBe('call');
    expect(refs.find((r) => r.toSymbol === 'Bucket')?.kind).toBe('call');
    expect(refs.find((r) => r.toSymbol === 'Widget')?.kind).toBe('call');
  });

  it('T3.1 — disambiguates type_identifier usage from declaration, per the verified rule table', () => {
    const src = `
type Alias = DebtItem;
interface Extended extends DebtItem {}
class C implements DebtItem {}
function f(x: DebtType): Array<DebtItem> { return [x]; }
`;
    const refs = parseReferences('src/types.ts', src);
    const typeRefs = refs.filter((r) => r.kind === 'type').map((r) => r.toSymbol);

    // DECLARATIONS — must NOT appear as usages.
    expect(typeRefs).not.toContain('Alias');
    expect(typeRefs).not.toContain('Extended');
    expect(typeRefs).not.toContain('C');

    // USAGES — must appear, each tagged kind: 'type'.
    // `DebtItem` appears 4 times (type_alias_declaration RHS, extends_type_clause,
    // implements_clause, type_arguments) but dedups per (name,line,kind).
    expect(typeRefs.filter((n) => n === 'DebtItem').length).toBeGreaterThanOrEqual(1);
    expect(typeRefs).toContain('DebtType');
    expect(typeRefs).toContain('Array');

    const aliasLine = src.split('\n').findIndex((l) => l.includes('type Alias')) + 1;
    expect(refs.find((r) => r.toSymbol === 'DebtItem' && r.line === aliasLine)?.kind).toBe('type');
  });

  it('produces no type references for a plain .js file (no type syntax in the JS grammar)', () => {
    const src = `function f(x) { return x; }\nf(1);\n`;
    const refs = parseReferences('src/plain.js', src);
    expect(refs.some((r) => r.kind === 'type')).toBe(false);
  });

  it('excludes type references inside an import statement', () => {
    const src = `import type { DebtItem } from './types';\nexport function f(): DebtItem | null { return null; }\n`;
    const refs = parseReferences('src/f.ts', src);
    // Only the return-type usage counts; the import specifier is not a reference.
    expect(refs.filter((r) => r.toSymbol === 'DebtItem')).toHaveLength(1);
    expect(refs.find((r) => r.toSymbol === 'DebtItem')?.line).toBe(2);
  });
});

describe('parseImports', () => {
  it('extracts default, named, namespace, and type-only bindings', () => {
    const src = `
import foo, { bar, type Baz, qux as quux } from './mod';
import * as ns from 'x';
import 'side-effect';
import type { OnlyT } from './t';
`;
    const imports = parseImports('src/x.ts', src);
    const find = (name: string) => imports.find((i) => i.name === name);

    expect(find('foo')).toMatchObject({ source: './mod', isType: false });
    expect(find('bar')).toMatchObject({ source: './mod', isType: false });
    expect(find('Baz')).toMatchObject({ source: './mod', isType: true });   // per-spec `type`
    expect(find('quux')).toMatchObject({ source: './mod', isType: false }); // alias kept as alias
    expect(find('ns')).toMatchObject({ source: 'x', isType: false });
    expect(find('OnlyT')).toMatchObject({ source: './t', isType: true });   // top-level `import type`
  });
});
