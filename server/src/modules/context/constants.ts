export const DOC_ROOTS = ['docs', 'specs', 'plans', 'insights'] as const;

export type DocRoot = (typeof DOC_ROOTS)[number];

export const DOC_EXTENSIONS = ['.md', '.mdx'] as const;

export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

export const MAX_DOCUMENTS = 500;

export { MAX_ATTACHMENTS } from '@devdigest/shared';

export const MAX_DOC_CHARS = 32_000;
export const MAX_BLOCK_CHARS = 120_000;

export const TRUNCATION_MARKER = '… (truncated)';
