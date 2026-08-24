import type { Risk } from "@devdigest/shared";
import { MIN_REFS_FOR_EXPANSION } from "./constants";

export function isExpandable(risk: Risk): boolean {
  return risk.explanation.trim().length > 0 || risk.file_refs.length >= MIN_REFS_FOR_EXPANSION;
}

export function riskKey(risk: Risk, index: number): string {
  return `${risk.kind}:${risk.title}:${index}`;
}

export function refKey(ref: string, index: number): string {
  return `${ref}:${index}`;
}
