import type { SmartDiff } from '@devdigest/shared';
import type { SmartDiffModel } from './classify.js';

export function toSmartDiffDto(model: SmartDiffModel): SmartDiff {
  return {
    groups: model.groups.map((group) => ({
      role: group.role,
      files: group.files.map((file) => ({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        finding_lines: file.findingLines,
      })),
    })),
    split_suggestion: model.split,
  };
}
