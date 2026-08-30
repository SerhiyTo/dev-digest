import type { FeatureModelId } from '@devdigest/shared';

export const BRIEF_FEATURE_MODEL_ID: FeatureModelId = 'risk_brief';
export const BRIEF_PROMPT_TEMPLATE = 'brief.risk.md';
export const BRIEF_SCHEMA_NAME = 'pr_brief_risk';

export const BRIEF_TIMEOUT_MS = 120_000;
export const BRIEF_MAX_RETRIES = 0;
export const STUCK_GENERATION_MS = 10 * 60_000;

export const MAX_RISKS = 12;
export const MAX_REFS_PER_RISK = 5;
export const MAX_FOCUS_ROWS = 5;

export const MAX_SUMMARY_CHARS = 400;
export const MAX_RISK_TITLE_CHARS = 80;
export const MAX_RISK_EXPLANATION_CHARS = 600;
export const MAX_FOCUS_REASON_CHARS = 140;
export const MAX_FILE_SUMMARY_CHARS = 200;

export const MAX_INPUT_TOTAL_BYTES = 200 * 1024;
export const MAX_INPUT_FILE_BYTES = 20 * 1024;
