import type { EvalExpectation, EvalExpectationKind, FindingCategory, Severity } from '@devdigest/shared';
import { MAX_EVAL_CASE_NAME_LENGTH } from './constants.js';

export type FindingActionState = 'accepted' | 'dismissed' | 'undecided';

export interface FindingActionTimestamps {
  acceptedAt: Date | string | null;
  dismissedAt: Date | string | null;
}

export function resolveFindingActionState(
  timestamps: FindingActionTimestamps,
): FindingActionState {
  if (timestamps.acceptedAt) return 'accepted';
  if (timestamps.dismissedAt) return 'dismissed';
  return 'undecided';
}

export interface FindingForEvalCase extends FindingActionTimestamps {
  file: string;
  startLine: number;
  endLine: number;
  category: FindingCategory;
  severity?: Severity | null;
}

export type ExpectationFromFindingResult =
  | { ok: true; expectations: EvalExpectation[] }
  | { ok: false; reason: 'undecided' };

const ACTION_STATE_TO_EXPECTATION_KIND: Record<'accepted' | 'dismissed', EvalExpectationKind> = {
  accepted: 'must_find',
  dismissed: 'must_not_flag',
};

export function deriveExpectationFromFinding(
  finding: FindingForEvalCase,
): ExpectationFromFindingResult {
  const state = resolveFindingActionState(finding);
  if (state === 'undecided') {
    return { ok: false, reason: 'undecided' };
  }
  const expectation: EvalExpectation = {
    kind: ACTION_STATE_TO_EXPECTATION_KIND[state],
    file: finding.file,
    line: finding.startLine,
    end_line: finding.endLine,
    category: finding.category,
  };
  return { ok: true, expectations: [expectation] };
}

const UNPRINTABLE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const COLLAPSIBLE_WHITESPACE = /\s+/g;
const TRAILING_DISAMBIGUATION_SUFFIX = /^(.*?)(\s\d+)$/;

function toSingleLine(name: string): string {
  return name.replace(UNPRINTABLE_CHARACTERS, ' ').replace(COLLAPSIBLE_WHITESPACE, ' ').trim();
}

export function truncateCaseName(name: string): string {
  const singleLine = toSingleLine(name);
  if (singleLine.length <= MAX_EVAL_CASE_NAME_LENGTH) return singleLine;

  const suffixed = TRAILING_DISAMBIGUATION_SUFFIX.exec(singleLine);
  if (!suffixed) return singleLine.slice(0, MAX_EVAL_CASE_NAME_LENGTH);

  const [, base, suffix] = suffixed;
  return `${base!.slice(0, MAX_EVAL_CASE_NAME_LENGTH - suffix!.length)}${suffix!}`;
}

export function disambiguateCaseName(
  baseName: string,
  existingNames: readonly string[],
): string {
  const truncated = truncateCaseName(baseName);
  if (!existingNames.includes(truncated)) return truncated;
  let suffix = 2;
  let candidate = truncateCaseName(`${truncated} ${suffix}`);
  while (existingNames.includes(candidate)) {
    suffix += 1;
    candidate = truncateCaseName(`${truncated} ${suffix}`);
  }
  return candidate;
}
