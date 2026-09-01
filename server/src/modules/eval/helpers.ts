import type { z } from 'zod';
import {
  EvalCaseRecord,
  EvalRunRecord,
  EvalSuiteRunRecord,
  type EvalExpectationKind,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

function parseOrFail<T>(schema: z.ZodType<T>, input: unknown, contractName: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('internal_error', `eval: ${contractName} failed its own contract`, 500);
  }
  return parsed.data;
}

export interface EvalCaseRowInput {
  id: string;
  ownerKind: string;
  ownerId: string;
  name: string;
  inputDiff: string | null;
  inputFiles: unknown;
  inputMeta: unknown;
  expectedOutput: unknown;
  notes: string | null;
  sourceFindingId: string | null;
  createdAt: Date | string;
  expectationKinds: EvalExpectationKind[];
  lastRunAt: Date | string | null;
  lastRunPass: boolean | null;
}

export function toEvalCaseRecord(row: EvalCaseRowInput): EvalCaseRecord {
  return parseOrFail(
    EvalCaseRecord,
    {
      id: row.id,
      owner_kind: row.ownerKind,
      owner_id: row.ownerId,
      name: row.name,
      input_diff: row.inputDiff ?? '',
      input_files: row.inputFiles,
      input_meta: row.inputMeta,
      expected_output: row.expectedOutput,
      notes: row.notes,
      source_finding_id: row.sourceFindingId,
      expectation_kinds: row.expectationKinds,
      last_run_at: toIsoOrNull(row.lastRunAt),
      last_run_pass: row.lastRunPass,
      created_at: toIso(row.createdAt),
    },
    'EvalCaseRecord',
  );
}

export interface EvalRunRowInput {
  id: string;
  caseId: string;
  caseName?: string | null;
  suiteRunId: string | null;
  agentVersion: number | null;
  ranAt: Date | string;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

export function toEvalRunRecord(row: EvalRunRowInput): EvalRunRecord {
  return parseOrFail(
    EvalRunRecord,
    {
      id: row.id,
      case_id: row.caseId,
      case_name: row.caseName ?? null,
      suite_run_id: row.suiteRunId,
      agent_version: row.agentVersion,
      ran_at: toIso(row.ranAt),
      actual_output: row.actualOutput,
      pass: row.pass,
      recall: row.recall,
      precision: row.precision,
      citation_accuracy: row.citationAccuracy,
      duration_ms: row.durationMs,
      cost_usd: row.costUsd,
    },
    'EvalRunRecord',
  );
}

export interface EvalSuiteRunRowInput {
  id: string;
  agentId: string;
  agentVersion: number;
  status: string;
  startedAt: Date | string;
  finishedAt: Date | string | null;
  casesTotal: number | null;
  casesPassed: number | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

export function toEvalSuiteRunRecord(row: EvalSuiteRunRowInput): EvalSuiteRunRecord {
  return parseOrFail(
    EvalSuiteRunRecord,
    {
      id: row.id,
      agent_id: row.agentId,
      agent_version: row.agentVersion,
      status: row.status,
      started_at: toIso(row.startedAt),
      finished_at: toIsoOrNull(row.finishedAt),
      cases_total: row.casesTotal,
      cases_passed: row.casesPassed,
      recall: row.recall,
      precision: row.precision,
      citation_accuracy: row.citationAccuracy,
      cost_usd: row.costUsd,
      duration_ms: row.durationMs,
    },
    'EvalSuiteRunRecord',
  );
}
