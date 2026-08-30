import type { OnboardingSectionKind } from '@devdigest/shared';

export const SECTION_KIND_ORDER: readonly OnboardingSectionKind[] = [
  'architecture',
  'critical_paths',
  'run_locally',
  'reading_path',
  'first_tasks',
] as const;

export const MAX_CRITICAL_PATHS = 6;
export const MAX_RUN_LOCALLY_STEPS = 8;
export const MAX_READING_PATH_STEPS = 5;
export const MAX_FIRST_TASKS = 6;
export const MAX_LINKS = 4;
export const MAX_STRING_CHARS = 200;
export const MAX_DOCUMENT_BYTES = 128 * 1024;
export const MAX_LOGGED_DROPPED_PATHS = 5;

export const INDEX_STATUSES_REQUIRING_DEGRADATION = ['partial', 'degraded', 'failed'] as const;
export type RepoIndexStatus = 'full' | (typeof INDEX_STATUSES_REQUIRING_DEGRADATION)[number];
