import type { FeatureModelId, IntentEvidenceKind } from '@devdigest/shared';

export const INTENT_FEATURE_MODEL_ID: FeatureModelId = 'review_intent';
export const INTENT_SCHEMA_NAME = 'PrIntentClassification';
export const INTENT_PROMPT_TEMPLATE = 'intent.classify.md';

export const INTENT_TIMEOUT_MS = 30_000;
export const INTENT_MAX_RETRIES = 1;

export const MAX_BODY_CHARS = 4_000;
export const MAX_TITLE_CHARS = 300;
export const MAX_FILE_PATHS = 60;
export const MAX_COMMITS = 20;
export const MAX_COMMIT_MESSAGE_CHARS = 200;

export const MAX_DOC_REFERENCES = 3;
export const MAX_DOC_PATH_CHARS = 200;
export const MAX_DOC_BYTES = 8_000;
export const MAX_DOC_TOTAL_BYTES = 20_000;
export const MAX_EXTERNAL_REFERENCES = 10;

export const MAX_ISSUE_REFERENCES = 3;
export const MAX_ISSUE_BODY_CHARS = 4_000;
export const MAX_LINK_REFERENCES = 3;
export const MAX_LINK_BYTES = 8_000;
export const MAX_LINK_TOTAL_BYTES = 16_000;
export const LINK_FETCH_TIMEOUT_MS = 5_000;
export const LINK_MAX_REDIRECTS = 2;

export const DOC_ROOTS = ['docs', 'specs', 'plans'] as const;
export const DOC_EXTENSIONS = ['.md', '.mdx', '.txt'] as const;

export const DETAILED_BODY_CHARS = 200;
export const DESCRIPTIVE_COMMIT_CHARS = 15;
export const MIN_DESCRIPTIVE_COMMITS = 2;

export const CONVENTIONAL_PREFIX =
  /^(feat|fix|chore|refactor|docs|test|perf|build|ci|style|revert)[(/:_-]/i;

export const INTENT_EVIDENCE_WEIGHTS: Record<IntentEvidenceKind, number> = {
  pr_body: 0.1,
  pr_body_detailed: 0.1,
  doc_reference_read: 0.25,
  doc_reference_unresolved: 0.05,
  issue_read: 0.2,
  issue_reference: 0.05,
  external_link_read: 0.1,
  external_link: 0.05,
  commit_messages: 0.1,
  conventional_prefix: 0.05,
  changed_paths: 0.1,
};
