import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodRawShape } from 'zod';
import { normalizeObjectSchema, objectFromShape } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { INSTRUCTIONS } from '../src/instructions.js';
import { MAX_DESCRIPTION_CHARS, TOOL_ORDER } from '../src/constants.js';
import { TOOLS } from '../src/tools/registry.js';

const objectFromShapeAtToolsListDepth = objectFromShape as unknown as (shape: ZodRawShape) => unknown;
const normalizeObjectSchemaAtToolsListDepth = normalizeObjectSchema as unknown as (schema: unknown) => unknown;
const toJsonSchemaCompatAtToolsListDepth = toJsonSchemaCompat as unknown as (
  schema: unknown,
  opts: { strictUnions?: boolean; pipeStrategy?: 'input' | 'output' },
) => Record<string, unknown>;

const EXPECTED_TOOL_ORDER = [
  'list_agents',
  'run_agent_on_pr',
  'get_findings',
  'get_conventions',
  'get_blast_radius',
] as const;

const INSTRUCTIONS_CHAR_BUDGET = 2048;
const TOOLS_LIST_SERIALIZED_CHAR_BUDGET = 3500;
const RESIDENT_TOKEN_BUDGET = 400;
const CHARS_PER_TOKEN = 4;

function overBudgetBy(actual: number, budget: number): string {
  const over = actual - budget;
  return over > 0 ? `${over} over` : `${Math.abs(over)} under`;
}

function inputSchemaAsShippedInToolsListViaSdkConversion(shape: ZodRawShape): Record<string, unknown> {
  const registered = objectFromShapeAtToolsListDepth(shape);
  const normalized = normalizeObjectSchemaAtToolsListDepth(registered);
  return normalized
    ? toJsonSchemaCompatAtToolsListDepth(normalized, { strictUnions: true, pipeStrategy: 'input' })
    : { type: 'object', properties: {} };
}

function toolsListEntries(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: inputSchemaAsShippedInToolsListViaSdkConversion(tool.inputSchema),
  }));
}

function walkTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTsFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('tool registration order', () => {
  it('TOOL_ORDER is exactly the five expected tool names, in the expected order', () => {
    expect(TOOL_ORDER).toEqual(EXPECTED_TOOL_ORDER);
  });

  it('TOOLS registers in exactly TOOL_ORDER, so a reorder or rename fails loudly here', () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(
      names,
      `TOOLS registers ${JSON.stringify(names)}, but TOOL_ORDER says ${JSON.stringify(TOOL_ORDER)}`,
    ).toEqual([...TOOL_ORDER]);
  });
});

describe('resident instructions budget', () => {
  it('stays under the 2048-char limit Claude Code truncates server instructions at', () => {
    expect(
      INSTRUCTIONS.length,
      `INSTRUCTIONS is ${INSTRUCTIONS.length} chars, ${overBudgetBy(INSTRUCTIONS.length, INSTRUCTIONS_CHAR_BUDGET)} the ${INSTRUCTIONS_CHAR_BUDGET}-char budget`,
    ).toBeLessThan(INSTRUCTIONS_CHAR_BUDGET);
  });

  it('pins the exact length so any edit to the string shows up as a reviewed diff', () => {
    expect(INSTRUCTIONS.length).toMatchInlineSnapshot(`1278`);
  });
});

describe('per-tool description budget', () => {
  it('every tool description stays at or under MAX_DESCRIPTION_CHARS', () => {
    const offenders = TOOLS.filter((tool) => tool.description.length > MAX_DESCRIPTION_CHARS).map(
      (tool) => `${tool.name}: ${tool.description.length} chars (${overBudgetBy(tool.description.length, MAX_DESCRIPTION_CHARS)} the ${MAX_DESCRIPTION_CHARS}-char budget)`,
    );
    expect(offenders, offenders.join('; ')).toEqual([]);
  });

  it('pins the exact per-tool lengths so any edit shows up as a reviewed diff', () => {
    const lengths = Object.fromEntries(TOOLS.map((tool) => [tool.name, tool.description.length]));
    expect(lengths).toMatchInlineSnapshot(`
      {
        "get_blast_radius": 180,
        "get_conventions": 175,
        "get_findings": 221,
        "list_agents": 158,
        "run_agent_on_pr": 204,
      }
    `);
  });
});

describe('outputSchema is never declared', () => {
  it('no tool carries an outputSchema field: it costs context with no consumer', () => {
    const offenders = TOOLS.filter((tool) => Object.prototype.hasOwnProperty.call(tool, 'outputSchema')).map(
      (tool) => tool.name,
    );
    expect(offenders, `these tools declare outputSchema: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('serialized tools/list size', () => {
  it('the tools/list JSON-RPC response - name, description, and inputSchema converted through the SDK\'s own zod-to-json-schema path, not JSON.stringify(TOOLS) which would count internal zod schema instances nothing downstream ever sees - stays under the serialized-size budget', () => {
    const serialized = JSON.stringify(toolsListEntries());
    expect(
      serialized.length,
      `serialized tools/list response is ${serialized.length} chars, ${overBudgetBy(serialized.length, TOOLS_LIST_SERIALIZED_CHAR_BUDGET)} the ${TOOLS_LIST_SERIALIZED_CHAR_BUDGET}-char budget`,
    ).toBeLessThan(TOOLS_LIST_SERIALIZED_CHAR_BUDGET);
  });

  it('pins the exact serialized size so a schema or description edit shows up as a reviewed diff', () => {
    const serialized = JSON.stringify(toolsListEntries());
    expect(serialized.length).toMatchInlineSnapshot(`3243`);
  });
});

describe('resident session cost', () => {
  it('tool names plus INSTRUCTIONS, at roughly chars/4 tokens, stays under the 400-token budget', () => {
    const residentChars = TOOLS.reduce((sum, tool) => sum + tool.name.length, 0) + INSTRUCTIONS.length;
    const residentTokens = residentChars / CHARS_PER_TOKEN;
    expect(
      residentTokens,
      `resident cost is ~${residentTokens.toFixed(1)} tokens (${residentChars} chars of names+instructions), ${overBudgetBy(residentTokens, RESIDENT_TOKEN_BUDGET)} the ${RESIDENT_TOKEN_BUDGET}-token budget`,
    ).toBeLessThan(RESIDENT_TOKEN_BUDGET);
  });
});

describe('stdout discipline', () => {
  it('no file under src/** writes console.log or process.stdout.write, since stdout is the JSON-RPC channel', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const srcRoot = path.resolve(here, '../src');
    const files = walkTsFiles(srcRoot);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files
      .filter((file) => {
        const content = readFileSync(file, 'utf8');
        return content.includes('console.log(') || content.includes('process.stdout.write(');
      })
      .map((file) => path.relative(srcRoot, file));

    expect(offenders, `these files would corrupt the JSON-RPC stdout channel: ${offenders.join(', ')}`).toEqual([]);
  });
});
