import {
  Onboarding,
  OnboardingSection,
  OnboardingTaskComplexity,
  type OnboardingCriticalPathEntry,
  type OnboardingFirstTask,
  type OnboardingLink,
  type OnboardingReadingPathStep,
  type OnboardingRunLocallyStep,
  type OnboardingSectionKind,
} from '@devdigest/shared';
import {
  INDEX_STATUSES_REQUIRING_DEGRADATION,
  MAX_CRITICAL_PATHS,
  MAX_DOCUMENT_BYTES,
  MAX_FIRST_TASKS,
  MAX_LINKS,
  MAX_LOGGED_DROPPED_PATHS,
  MAX_READING_PATH_STEPS,
  MAX_RUN_LOCALLY_STEPS,
  MAX_STRING_CHARS,
  SECTION_KIND_ORDER,
  type RepoIndexStatus,
} from './constants.js';

export type SectionKindValidation = { ok: true } | { ok: false; reason: string };

export function validateSectionKinds(kinds: readonly string[]): SectionKindValidation {
  const missing = SECTION_KIND_ORDER.filter((kind) => !kinds.includes(kind));
  const extra = kinds.filter((kind) => !SECTION_KIND_ORDER.includes(kind as OnboardingSectionKind));
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const kind of kinds) {
    if (seen.has(kind)) duplicated.add(kind);
    seen.add(kind);
  }
  if (missing.length === 0 && extra.length === 0 && duplicated.size === 0) {
    return { ok: true };
  }
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing ${missing.join(', ')}`);
  if (extra.length > 0) parts.push(`unexpected ${extra.join(', ')}`);
  if (duplicated.size > 0) parts.push(`duplicated ${[...duplicated].join(', ')}`);
  return { ok: false, reason: `invalid section kind set: ${parts.join('; ')}` };
}

const URL_ENCODED_SEPARATOR = /%2f|%5c/i;

function decodesToItself(candidate: string): boolean {
  try {
    return decodeURIComponent(candidate) === candidate;
  } catch {
    return false;
  }
}

export function isGroundedPath(path: string, indexedPaths: ReadonlySet<string>): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.includes('\0') || path.includes('\\')) return false;
  if (URL_ENCODED_SEPARATOR.test(path)) return false;
  if (!decodesToItself(path)) return false;
  if (path.startsWith('/') || path.startsWith('~')) return false;
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return false;

  if (indexedPaths.has(path)) return true;
  const prefix = `${path}/`;
  for (const indexed of indexedPaths) {
    if (indexed.startsWith(prefix)) return true;
  }
  return false;
}

export interface GroundingResult<T> {
  survivors: T[];
  droppedCount: number;
  droppedSample: T[];
}

export function groundEntries<T>(
  entries: readonly T[],
  indexedPaths: ReadonlySet<string>,
  pathOf: (entry: T) => string,
): GroundingResult<T> {
  const survivors: T[] = [];
  const dropped: T[] = [];
  for (const entry of entries) {
    if (isGroundedPath(pathOf(entry), indexedPaths)) survivors.push(entry);
    else dropped.push(entry);
  }
  return {
    survivors,
    droppedCount: dropped.length,
    droppedSample: dropped.slice(0, MAX_LOGGED_DROPPED_PATHS),
  };
}

const NUMBER_LITERAL = /\d+(\.\d+)?/g;

export function reasonNumbersAreGrounded(reason: string, allowedNumbers: ReadonlySet<string>): boolean {
  const matches = reason.match(NUMBER_LITERAL) ?? [];
  return matches.every((literal) => allowedNumbers.has(literal));
}

export function isValidComplexity(value: string): value is OnboardingTaskComplexity {
  return OnboardingTaskComplexity.safeParse(value).success;
}

export function truncateString(value: string, max: number = MAX_STRING_CHARS): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function capArray<T>(items: readonly T[], max: number): T[] {
  return items.slice(0, max);
}

function truncateUtf8Bytes(value: string, maxBytes: number): string {
  const buf = Buffer.from(value, 'utf8');
  if (buf.byteLength <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && ((buf[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, Math.max(end, 0)).toString('utf8');
}

function cappedLinks(links: readonly OnboardingLink[]): OnboardingLink[] {
  return capArray(links, MAX_LINKS).map((link) => ({
    label: truncateString(link.label),
    path: link.path,
  }));
}

function cappedCriticalPaths(
  entries: readonly OnboardingCriticalPathEntry[] | null | undefined,
): OnboardingCriticalPathEntry[] | null | undefined {
  if (entries == null) return entries;
  return capArray(entries, MAX_CRITICAL_PATHS).map((entry) => ({
    path: entry.path,
    reason: truncateString(entry.reason),
  }));
}

function cappedRunLocally(
  steps: readonly OnboardingRunLocallyStep[] | null | undefined,
): OnboardingRunLocallyStep[] | null | undefined {
  if (steps == null) return steps;
  return capArray(steps, MAX_RUN_LOCALLY_STEPS).map((step) => ({
    command: truncateString(step.command),
    note: step.note != null ? truncateString(step.note) : step.note,
  }));
}

function cappedReadingPath(
  steps: readonly OnboardingReadingPathStep[] | null | undefined,
): OnboardingReadingPathStep[] | null | undefined {
  if (steps == null) return steps;
  return capArray(steps, MAX_READING_PATH_STEPS).map((step) => ({
    path: step.path,
    rationale: truncateString(step.rationale),
  }));
}

function cappedFirstTasks(
  tasks: readonly OnboardingFirstTask[] | null | undefined,
): OnboardingFirstTask[] | null | undefined {
  if (tasks == null) return tasks;
  return capArray(tasks, MAX_FIRST_TASKS).map((task) => ({
    title: truncateString(task.title),
    hint_path: task.hint_path,
    complexity: task.complexity,
  }));
}

function applySectionFieldCaps(section: OnboardingSection): OnboardingSection {
  return {
    ...section,
    title: truncateString(section.title),
    links: cappedLinks(section.links),
    critical_paths: cappedCriticalPaths(section.critical_paths),
    run_locally: cappedRunLocally(section.run_locally),
    reading_path: cappedReadingPath(section.reading_path),
    first_tasks: cappedFirstTasks(section.first_tasks),
  };
}

function truncateToDocumentBudget(tour: Onboarding, maxBytes: number): Onboarding {
  const currentSize = Buffer.byteLength(JSON.stringify(tour), 'utf8');
  if (currentSize <= maxBytes) return tour;

  const overheadTour: Onboarding = {
    ...tour,
    sections: tour.sections.map((section) => ({
      ...section,
      body: '',
      diagram: section.diagram != null ? '' : section.diagram,
    })),
  };
  const overhead = Buffer.byteLength(JSON.stringify(overheadTour), 'utf8');
  const budgetForContent = Math.max(0, maxBytes - overhead);
  const perSection = Math.floor(budgetForContent / Math.max(1, tour.sections.length));

  return {
    ...tour,
    sections: tour.sections.map((section) => {
      const diagramBudget = section.diagram != null ? Math.floor(perSection / 2) : 0;
      const diagram = section.diagram != null ? truncateUtf8Bytes(section.diagram, diagramBudget) : section.diagram;
      const diagramBytes = diagram != null ? Buffer.byteLength(diagram, 'utf8') : 0;
      const bodyBudget = Math.max(0, perSection - diagramBytes);
      return {
        ...section,
        body: truncateUtf8Bytes(section.body, bodyBudget),
        diagram,
      };
    }),
  };
}

export function applyCaps(tour: Onboarding, maxDocumentBytes: number = MAX_DOCUMENT_BYTES): Onboarding {
  const capped: Onboarding = {
    ...tour,
    sections: tour.sections.map((section) => applySectionFieldCaps(section)),
  };
  return truncateToDocumentBudget(capped, maxDocumentBytes);
}

export function degradedFromIndexStatus(status: RepoIndexStatus): {
  degraded: boolean;
  reason: string | null;
} {
  if ((INDEX_STATUSES_REQUIRING_DEGRADATION as readonly string[]).includes(status)) {
    return { degraded: true, reason: `repository index status is ${status}` };
  }
  return { degraded: false, reason: null };
}

export interface StoredTourRead {
  tour: Onboarding;
  degraded: boolean;
  reason: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function salvageSections(raw: unknown): OnboardingSection[] {
  if (!isRecord(raw) || !Array.isArray(raw.sections)) return [];
  const salvaged: OnboardingSection[] = [];
  for (const candidate of raw.sections) {
    const parsed = OnboardingSection.safeParse(candidate);
    if (parsed.success) salvaged.push(parsed.data);
  }
  return salvaged;
}

export function readStoredTour(raw: unknown): StoredTourRead {
  const parsed = Onboarding.safeParse(raw);
  if (parsed.success) {
    return {
      tour: parsed.data,
      degraded: parsed.data.degraded,
      reason: parsed.data.degraded_reason ?? undefined,
    };
  }
  const reason = `stored tour failed the closed-kind contract: ${parsed.error.issues
    .map((issue) => issue.message)
    .join('; ')}`;
  return {
    tour: { sections: salvageSections(raw), degraded: true, degraded_reason: reason },
    degraded: true,
    reason,
  };
}

export function isStale(generatedSha: string | null | undefined, currentSha: string | null | undefined): boolean {
  if (!generatedSha || !currentSha) return false;
  return generatedSha !== currentSha;
}
