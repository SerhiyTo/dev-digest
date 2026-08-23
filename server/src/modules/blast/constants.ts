export const MAX_CHANGED_SYMBOLS = 50;
export const MAX_CALLERS_PER_SYMBOL = 20;
export const MAX_FACTS_PER_SYMBOL = 12;
export const MAX_ROLLUP = 40;
export const MAX_DOWNSTREAM = 25;
export const MAX_LOGGED_ORPHAN_SAMPLES = 5;

export const MAX_HISTORY_PROBE_PATHS = 200;
export const MAX_HISTORY_PRS = 5;
export const MAX_OVERLAP_PATHS_PER_PR = 5;

/**
 * Hand-copied from `server/src/modules/repo-intel/constants.ts`'s
 * `MAX_CALLERS_PER_SYMBOL` (also 20) — `blast` cannot import it: `ports.ts`
 * must stay import-free and `no-cross-slice-imports` blocks even `import
 * type` from `modules/repo-intel/**`. This is the cap the ENGINE applies
 * globally to `BlastResult.callers` before it ever reaches this slice, so
 * `engine.callers.length >= ENGINE_CALLER_CAP` is the only reliable signal
 * that the engine itself truncated. Keep this value in sync by hand; a
 * server test pins it so drift at least shows up in a diff.
 */
export const ENGINE_CALLER_CAP = 20;
