import type { Finding, FindingCategory, Severity } from '@devdigest/shared';
import { EVAL_LINE_TOLERANCE } from './constants.js';

export type EvalExpectationKind = 'must_find' | 'must_not_flag';

export interface EvalExpectation {
  kind: EvalExpectationKind;
  file: string;
  line: number;
  end_line?: number | null;
  category: FindingCategory;
  severity?: Severity | null;
  title_contains?: string | null;
}

export interface EvalExpectationOutcome {
  expectationIndex: number;
  kind: EvalExpectationKind;
  matched: boolean;
  matchedFinding: Finding | null;
  severityAgreement: boolean | null;
  titleAgreement: boolean | null;
  citedWithinWindow: boolean | null;
}

export interface EvalCaseScore {
  expectationOutcomes: EvalExpectationOutcome[];
  mustFindTotal: number;
  mustFindMatched: number;
  findingsTotal: number;
  findingsMatchedToMustFind: number;
  citationCandidates: number;
  citationAccurate: number;
  mustNotFlagViolated: number;
  passed: boolean;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
}

export interface EvalRunAggregate {
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  casesPassed: number;
  casesTotal: number;
}

function normalizedRange(low: number, high: number): [number, number] {
  return low <= high ? [low, high] : [high, low];
}

function expectationRange(expectation: EvalExpectation): [number, number] {
  return normalizedRange(expectation.line, expectation.end_line ?? expectation.line);
}

function widenedExpectationRange(expectation: EvalExpectation): [number, number] {
  const [low, high] = expectationRange(expectation);
  return [low - EVAL_LINE_TOLERANCE, high + EVAL_LINE_TOLERANCE];
}

function findingRange(finding: Finding): [number, number] {
  return normalizedRange(finding.start_line, finding.end_line);
}

function rangesOverlap(aLow: number, aHigh: number, bLow: number, bHigh: number): boolean {
  return aLow <= bHigh && bLow <= aHigh;
}

function rangeContains(
  outerLow: number,
  outerHigh: number,
  innerLow: number,
  innerHigh: number,
): boolean {
  return innerLow >= outerLow && innerHigh <= outerHigh;
}

function findingMatchesExpectation(finding: Finding, expectation: EvalExpectation): boolean {
  if (finding.file !== expectation.file) return false;
  if (finding.category !== expectation.category) return false;
  const [fLow, fHigh] = findingRange(finding);
  const [eLow, eHigh] = widenedExpectationRange(expectation);
  return rangesOverlap(fLow, fHigh, eLow, eHigh);
}

function findingCitedWithinWindow(finding: Finding, expectation: EvalExpectation): boolean {
  const [fLow, fHigh] = findingRange(finding);
  const [eLow, eHigh] = widenedExpectationRange(expectation);
  return rangeContains(eLow, eHigh, fLow, fHigh);
}

function lineDistance(finding: Finding, expectation: EvalExpectation): number {
  const [fLow] = findingRange(finding);
  const [eLow] = expectationRange(expectation);
  return Math.abs(fLow - eLow);
}

function pickCanonicalMatch(candidates: Finding[], expectation: EvalExpectation): Finding {
  const sorted = [...candidates].sort((a, b) => {
    const distance = lineDistance(a, expectation) - lineDistance(b, expectation);
    if (distance !== 0) return distance;
    return a.id.localeCompare(b.id);
  });
  const [first] = sorted;
  if (!first) {
    throw new Error('pickCanonicalMatch called with an empty candidate list');
  }
  return first;
}

function severityAgreement(finding: Finding, expectation: EvalExpectation): boolean | null {
  if (!expectation.severity) return null;
  return finding.severity === expectation.severity;
}

function titleAgreement(finding: Finding, expectation: EvalExpectation): boolean | null {
  if (!expectation.title_contains) return null;
  return finding.title.includes(expectation.title_contains);
}

export function scoreEvalCase(
  expectations: EvalExpectation[],
  findings: Finding[],
): EvalCaseScore {
  const expectationOutcomes: EvalExpectationOutcome[] = expectations.map(
    (expectation, expectationIndex) => {
      const candidates = findings.filter((finding) =>
        findingMatchesExpectation(finding, expectation),
      );
      const matched = candidates.length > 0;
      const canonicalMatch = matched ? pickCanonicalMatch(candidates, expectation) : null;
      return {
        expectationIndex,
        kind: expectation.kind,
        matched,
        matchedFinding: canonicalMatch,
        severityAgreement: canonicalMatch ? severityAgreement(canonicalMatch, expectation) : null,
        titleAgreement: canonicalMatch ? titleAgreement(canonicalMatch, expectation) : null,
        citedWithinWindow: canonicalMatch
          ? findingCitedWithinWindow(canonicalMatch, expectation)
          : null,
      };
    },
  );

  const mustFindOutcomes = expectationOutcomes.filter((outcome) => outcome.kind === 'must_find');
  const mustNotFlagOutcomes = expectationOutcomes.filter(
    (outcome) => outcome.kind === 'must_not_flag',
  );
  const mustFindExpectations = expectations.filter((e) => e.kind === 'must_find');

  const mustFindTotal = mustFindOutcomes.length;
  const mustFindMatched = mustFindOutcomes.filter((outcome) => outcome.matched).length;
  const mustNotFlagViolated = mustNotFlagOutcomes.filter((outcome) => outcome.matched).length;

  const findingsTotal = findings.length;
  let findingsMatchedToMustFind = 0;
  let citationAccurate = 0;
  for (const finding of findings) {
    const matchingMustFind = mustFindExpectations.filter((expectation) =>
      findingMatchesExpectation(finding, expectation),
    );
    if (matchingMustFind.length === 0) continue;
    findingsMatchedToMustFind += 1;
    const citedAccurately = matchingMustFind.some((expectation) =>
      findingCitedWithinWindow(finding, expectation),
    );
    if (citedAccurately) citationAccurate += 1;
  }
  const citationCandidates = findingsMatchedToMustFind;

  const passed = mustFindMatched === mustFindTotal && mustNotFlagViolated === 0;

  return {
    expectationOutcomes,
    mustFindTotal,
    mustFindMatched,
    findingsTotal,
    findingsMatchedToMustFind,
    citationCandidates,
    citationAccurate,
    mustNotFlagViolated,
    passed,
    recall: mustFindTotal > 0 ? mustFindMatched / mustFindTotal : null,
    precision: findingsTotal > 0 ? findingsMatchedToMustFind / findingsTotal : null,
    citationAccuracy: citationCandidates > 0 ? citationAccurate / citationCandidates : null,
  };
}

export function aggregateEvalRun(caseResults: EvalCaseScore[]): EvalRunAggregate {
  let mustFindTotalSum = 0;
  let mustFindMatchedSum = 0;
  let findingsTotalSum = 0;
  let findingsMatchedSum = 0;
  let citationCandidatesSum = 0;
  let citationAccurateSum = 0;
  let casesPassed = 0;

  for (const caseResult of caseResults) {
    if (caseResult.mustFindTotal > 0) {
      mustFindTotalSum += caseResult.mustFindTotal;
      mustFindMatchedSum += caseResult.mustFindMatched;
    }
    if (caseResult.findingsTotal > 0) {
      findingsTotalSum += caseResult.findingsTotal;
      findingsMatchedSum += caseResult.findingsMatchedToMustFind;
    }
    citationCandidatesSum += caseResult.citationCandidates;
    citationAccurateSum += caseResult.citationAccurate;
    if (caseResult.passed) casesPassed += 1;
  }

  return {
    recall: mustFindTotalSum > 0 ? mustFindMatchedSum / mustFindTotalSum : null,
    precision: findingsTotalSum > 0 ? findingsMatchedSum / findingsTotalSum : null,
    citationAccuracy: citationCandidatesSum > 0 ? citationAccurateSum / citationCandidatesSum : null,
    casesPassed,
    casesTotal: caseResults.length,
  };
}
