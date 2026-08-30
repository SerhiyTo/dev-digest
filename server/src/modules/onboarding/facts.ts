import type { RepoRef } from '@devdigest/shared';
import type { GitReader, RepoFacts } from './ports.js';

const UNTRUSTED_CLOSER = '</untrusted>';
const NUMBER_LITERAL = /\d+(\.\d+)?/g;
const EMPTY_PLACEHOLDER = '(none detected)';

const TOP_FILES_COUNT = 20;
const MAX_CRITICAL_PATH_CANDIDATES = 20;
const MAX_PACKAGE_SCRIPTS = 20;
const PACKAGE_MANIFEST_PATH = 'package.json';

export function escapeFence(value: string): string {
  return value.replaceAll(UNTRUSTED_CLOSER, '<\\/untrusted>');
}

export interface OnboardingPackageScript {
  name: string;
  command: string;
}

export interface OnboardingFacts {
  block: string;
  topFiles: readonly string[];
  criticalPathCandidates: readonly string[];
  packageScripts: readonly OnboardingPackageScript[];
  repoMapDegraded: boolean;
  citableNumbers: ReadonlySet<string>;
}

function fence(source: string, content: string): string {
  const body = content.trim().length > 0 ? content : EMPTY_PLACEHOLDER;
  return `<untrusted source="${source}">\n${escapeFence(body)}\n${UNTRUSTED_CLOSER}`;
}

function flattenCriticalPathChains(chains: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const flat: string[] = [];
  for (const chain of chains) {
    for (const path of chain) {
      if (seen.has(path)) continue;
      seen.add(path);
      flat.push(path);
    }
  }
  return flat;
}

async function rankedCriticalPathCandidates(
  repoIntel: RepoFacts,
  repoId: string,
  chains: readonly (readonly string[])[],
): Promise<{ paths: string[]; percentileOf: ReadonlyMap<string, number> }> {
  const flat = flattenCriticalPathChains(chains);
  if (flat.length === 0) return { paths: [], percentileOf: new Map() };
  const ranks = await repoIntel.getFileRank(repoId, flat);
  const percentileOf = new Map(ranks.map((r) => [r.path, r.percentile]));
  const paths = [...flat]
    .sort((a, b) => (percentileOf.get(b) ?? -1) - (percentileOf.get(a) ?? -1))
    .slice(0, MAX_CRITICAL_PATH_CANDIDATES);
  return { paths, percentileOf };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readPackageScripts(
  git: GitReader,
  repo: RepoRef,
): Promise<OnboardingPackageScript[]> {
  let raw: string;
  try {
    raw = await git.readFile(repo, PACKAGE_MANIFEST_PATH);
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !isRecord(parsed.scripts)) return [];
  return Object.entries(parsed.scripts)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .slice(0, MAX_PACKAGE_SCRIPTS)
    .map(([name, command]) => ({ name, command }));
}

function renderPathList(paths: readonly string[]): string {
  return paths.join('\n');
}

function renderRankedCandidates(
  paths: readonly string[],
  percentileOf: ReadonlyMap<string, number>,
): string {
  return paths
    .map((path) => {
      const percentile = percentileOf.get(path);
      return percentile === undefined ? path : `${path} (${percentile}th percentile)`;
    })
    .join('\n');
}

function renderPackageScripts(scripts: readonly OnboardingPackageScript[]): string {
  return scripts.map((script) => `${script.name}: ${script.command}`).join('\n');
}

export async function assembleOnboardingFacts(
  repoIntel: RepoFacts,
  git: GitReader,
  repo: RepoRef,
  repoId: string,
): Promise<OnboardingFacts> {
  const [repoMap, topFiles, criticalPathChains, packageScripts] = await Promise.all([
    repoIntel.getRepoMap(repoId),
    repoIntel.getTopFilesByRank(repoId, TOP_FILES_COUNT),
    repoIntel.getCriticalPaths(repoId),
    readPackageScripts(git, repo),
  ]);

  const { paths: criticalPathCandidates, percentileOf } = await rankedCriticalPathCandidates(
    repoIntel,
    repoId,
    criticalPathChains,
  );

  const block = [
    fence('repo-map', repoMap.text),
    fence('top-ranked-files', renderPathList(topFiles)),
    fence('critical-path-candidates', renderRankedCandidates(criticalPathCandidates, percentileOf)),
    fence('package-scripts', renderPackageScripts(packageScripts)),
  ].join('\n\n');

  return {
    block,
    topFiles,
    criticalPathCandidates,
    packageScripts,
    repoMapDegraded: repoMap.degraded ?? false,
    citableNumbers: new Set(block.match(NUMBER_LITERAL) ?? []),
  };
}
