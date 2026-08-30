import type { SmartDiff } from '@devdigest/shared';
import type { SmartDiffModel } from './classify.js';

export function toSmartDiffDto(
  model: SmartDiffModel,
  summaryByPath: ReadonlyMap<string, string> = new Map(),
): SmartDiff {
  return {
    groups: model.groups.map((group) => ({
      role: group.role,
      files: group.files.map((file) => {
        const summary = summaryByPath.get(file.path);
        return {
          path: file.path,
          additions: file.additions,
          deletions: file.deletions,
          finding_lines: file.findingLines,
          ...(summary !== undefined ? { pseudocode_summary: summary } : {}),
        };
      }),
    })),
    split_suggestion: model.split,
  };
}
