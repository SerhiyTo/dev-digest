/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Rolling window, in days, over which skill usage statistics are aggregated. */
export const STATS_WINDOW_DAYS = 30;

/** The only source a client may create an already-enabled skill with. */
export const MANUAL_SKILL_SOURCE = 'manual';

/** Default skill description when none is supplied on insert. */
export const DEFAULT_SKILL_DESCRIPTION = '';
