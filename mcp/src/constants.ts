export const MAX_PAYLOAD_CHARS = 6000;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const POLL_FAST_MS = 2000;
export const POLL_SLOW_MS = 5000;
export const POLL_FAST_COUNT = 15;
export const MAX_DESCRIPTION_CHARS = 320;

export const TOOL_ORDER = [
  'list_agents',
  'run_agent_on_pr',
  'get_findings',
  'get_conventions',
  'get_blast_radius',
] as const;
