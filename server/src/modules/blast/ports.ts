export interface BlastEngineCaller {
  file: string;
  symbol: string;
  viaSymbol: string;
  line: number;
  rank: number;
  /** 'call' | 'type' — absent on the degraded/ripgrep path (call-only there). */
  kind?: 'call' | 'type';
}

export interface BlastEngineChangedSymbol {
  file: string;
  name: string;
  kind: string;
}

/**
 * Structural mirror of `repo-intel/types.ts`'s `BlastResult` — re-declared
 * here rather than imported, because `no-cross-slice-imports` is depcruise
 * `severity: error` with `tsPreCompilationDeps: true` and no type-only
 * exemption: even `import type` from `modules/repo-intel/**` fails the tree.
 * `reason` is deliberately widened from repo-intel's `DegradedReason`
 * string-literal union to a plain `string` — a method's return type is
 * checked covariantly, so a narrower source field still satisfies this wider
 * port, and `routes.ts` can assign `container.repoIntel` straight into a
 * `BlastEngine`-typed variable with no cast.
 */
export interface BlastEngineResult {
  changedSymbols: BlastEngineChangedSymbol[];
  callers: BlastEngineCaller[];
  impactedEndpoints: string[];
  /** Keyed by CALLER file. Absent on the degraded/ripgrep path. */
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: string;
}

export interface BlastEngine {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastEngineResult>;
}

export interface BlastPullSummary {
  id: string;
  repoId: string;
}

export interface BlastHistoryRow {
  prNumber: number;
  title: string;
  author: string;
  status: string;
  updatedAt: Date | null;
  openedAt: Date | null;
  overlapCount: number;
  overlapPaths: string[];
}

export interface BlastStore {
  getPullSummary(workspaceId: string, prId: string): Promise<BlastPullSummary | undefined>;
  getChangedPaths(prId: string): Promise<string[]>;
  getPriorPrs(
    workspaceId: string,
    repoId: string,
    prId: string,
    paths: string[],
  ): Promise<BlastHistoryRow[]>;
}

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
