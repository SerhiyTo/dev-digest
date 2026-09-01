import type { EvalExpectation } from "@devdigest/shared";

export const FINDING_SKELETON_BY_KIND: Record<EvalExpectation["kind"], EvalExpectation> = {
  must_find: {
    kind: "must_find",
    file: "src/example.ts",
    line: 1,
    end_line: null,
    category: "bug",
    severity: null,
    title_contains: null,
  },
  must_not_flag: {
    kind: "must_not_flag",
    file: "src/example.ts",
    line: 1,
    end_line: null,
    category: "bug",
    severity: null,
    title_contains: null,
  },
};
