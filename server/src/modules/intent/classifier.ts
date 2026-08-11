import { z } from 'zod';
import { RiskSeverity, type LLMProvider } from '@devdigest/shared';
import { renderPrompt } from '../../platform/prompts.js';
import {
  INTENT_MAX_RETRIES,
  INTENT_PROMPT_TEMPLATE,
  INTENT_SCHEMA_NAME,
  INTENT_TIMEOUT_MS,
  MAX_BODY_CHARS,
  MAX_COMMITS,
  MAX_COMMIT_MESSAGE_CHARS,
  MAX_FILE_PATHS,
  MAX_TITLE_CHARS,
} from './constants.js';
import type { ClassifierInput, ClassifierResult, FetchedIssue, FetchedLink } from './ports.js';

export const PrIntentClassification = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risk_areas: z.array(z.object({ label: z.string(), severity: RiskSeverity })),
});
export type PrIntentClassification = z.infer<typeof PrIntentClassification>;

const EMPTY_PLACEHOLDER = '(none provided)';

export function escapeFence(value: string): string {
  return value.replaceAll('</untrusted>', '<\\/untrusted>');
}

function block(value: string): string {
  const trimmed = value.trim();
  return escapeFence(trimmed.length > 0 ? trimmed : EMPTY_PLACEHOLDER);
}

export function renderDocsBlock(docs: readonly { path: string; content: string }[]): string {
  if (docs.length === 0) return EMPTY_PLACEHOLDER;
  return docs.map((d) => `### ${d.path}\n${d.content}`).join('\n\n');
}

export function renderIssuesBlock(issues: readonly FetchedIssue[]): string {
  if (issues.length === 0) return EMPTY_PLACEHOLDER;
  return issues
    .map((i) => `### ${i.ref} — ${i.title} (${i.state})\n${i.body}`)
    .join('\n\n');
}

export function renderLinksBlock(links: readonly FetchedLink[]): string {
  if (links.length === 0) return EMPTY_PLACEHOLDER;
  return links.map((l) => `### ${l.url}${l.title ? ` — ${l.title}` : ''}\n${l.text}`).join('\n\n');
}

export function buildClassifierVars(input: ClassifierInput): Record<string, string> {
  return {
    title: block(input.title.slice(0, MAX_TITLE_CHARS)),
    branch: block(input.branch),
    body: block((input.body ?? '').slice(0, MAX_BODY_CHARS)),
    files: block(input.changedPaths.slice(0, MAX_FILE_PATHS).join('\n')),
    commits: block(
      input.commitMessages
        .slice(0, MAX_COMMITS)
        .map((m) => `- ${m.split('\n')[0]?.slice(0, MAX_COMMIT_MESSAGE_CHARS) ?? ''}`)
        .join('\n'),
    ),
    docs: block(renderDocsBlock(input.docs)),
    issues: block(renderIssuesBlock(input.issues)),
    pages: block(renderLinksBlock(input.links)),
  };
}

export async function runClassifier(
  llm: LLMProvider,
  model: string,
  input: ClassifierInput,
): Promise<ClassifierResult> {
  const result = await llm.completeStructured({
    model,
    schema: PrIntentClassification,
    schemaName: INTENT_SCHEMA_NAME,
    timeoutMs: INTENT_TIMEOUT_MS,
    maxRetries: INTENT_MAX_RETRIES,
    messages: [
      { role: 'system', content: await renderPrompt(INTENT_PROMPT_TEMPLATE, buildClassifierVars(input)) },
      { role: 'user', content: 'Derive the intent of this pull request.' },
    ],
  });

  return {
    data: result.data,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd ?? null,
  };
}
