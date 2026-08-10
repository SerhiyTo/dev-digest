import type { SkillType } from "@devdigest/shared";

/**
 * Local literals rather than `SkillType.options`: a value import from
 * @devdigest/shared pulls the vendored barrel into the webpack graph and can
 * break `pnpm build` while typecheck and tests stay green (client/INSIGHTS.md).
 */
export const SKILL_TYPE_VALUES: readonly SkillType[] = [
  "rubric",
  "convention",
  "security",
  "custom",
];

export const DEFAULT_SKILL_TYPE: SkillType = "convention";

export const NOT_INDEXED_REASON = "not_indexed";
