/**
 * Tunables for the conventions extractor. The size limits bound prompt cost and
 * latency — see `server/specs/2026-08-05-conventions.md`.
 */

export const CANDIDATE_FILE_COUNT = 80;
export const SELECTED_FILE_COUNT = 12;
export const MAX_CONVENTIONS = 12;

export const MAX_FILE_CHARS = 12_000;
export const MAX_TOTAL_FILE_CHARS = 120_000;

export const MIN_RULE_CHARS = 12;
export const MAX_RULE_CHARS = 400;
export const MAX_SNIPPET_LINES = 12;
export const MAX_EVIDENCE_PER_RULE = 3;
export const MAX_PROBE_CHARS = 200;

/**
 * Per-call ceilings only — the scan runs as a background task with no overall
 * deadline, so these exist to stop a hung provider connection leaving the scan
 * 'running' forever, not to fit an external budget. `completeStructured` retries
 * on schema failure, so the worst case is calls × (retries + 1) × timeout.
 * Extraction gets the larger share: step 1 sees paths only, step 2 sees files.
 */
export const SELECT_TIMEOUT_MS = 30_000;
export const EXTRACT_TIMEOUT_MS = 120_000;
export const STRUCTURED_MAX_RETRIES = 1;

export const SCAN_ABORTED_ERROR = 'Scan aborted before it could finish (the API restarted)';

export const FILE_SELECTION_SCHEMA_NAME = 'ConventionFileSelection';
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

export const SELECT_PROMPT_TEMPLATE = 'conventions.select.md';
export const EXTRACT_PROMPT_TEMPLATE = 'conventions.extract.md';

export const CONVENTIONS_FEATURE_MODEL_ID = 'conventions';
export const EXTRACTED_SKILL_SOURCE = 'extracted';
export const CONVENTION_SKILL_TYPE = 'convention';

export const SKILL_SLUG_SUFFIX = 'conventions';
export const SECTION_SLUG_WORDS = 6;
export const MAX_SECTION_SLUG_CHARS = 48;

export const TRUNCATION_MARKER = '… (truncated)';

export const FENCE_LANG_BY_EXT: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
  '.py': 'python',
  '.go': 'go',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.php': 'php',
  '.cs': 'csharp',
  '.sql': 'sql',
  '.sh': 'bash',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.json': 'json',
  '.md': 'md',
};
