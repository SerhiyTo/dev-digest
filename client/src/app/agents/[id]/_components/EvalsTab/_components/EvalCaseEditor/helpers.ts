import { z } from "zod";
import { EvalExpectation, type EvalExpectationKind } from "@devdigest/shared";
import { FINDING_SKELETON_BY_KIND } from "./constants";

export type ExpectedOutputValidation =
  | { valid: true; value: EvalExpectation[] }
  | { valid: false };

const EvalExpectationList = z.array(EvalExpectation);

export function validateExpectedOutputText(text: string): ExpectedOutputValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { valid: false };
  }
  const result = EvalExpectationList.safeParse(parsed);
  if (!result.success) return { valid: false };
  return { valid: true, value: result.data };
}

export function insertFindingSkeleton(currentText: string, kind: EvalExpectationKind): string {
  const parsed = validateExpectedOutputText(currentText);
  const existing = parsed.valid ? parsed.value : [];
  const next = [...existing, FINDING_SKELETON_BY_KIND[kind]];
  return JSON.stringify(next, null, 2);
}
