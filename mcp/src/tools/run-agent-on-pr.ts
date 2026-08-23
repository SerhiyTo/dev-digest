import { z } from 'zod';
import { Severity } from '@devdigest/shared';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants.js';
import { selectFindings } from '../domain/select.js';
import { capPayload, toFindingsPayload } from '../format/compact.js';
import type { ToolErrorResult } from '../format/errors.js';
import { reviewStartedNoRun, runFailed, shapeMismatch, waitBudgetExceeded } from '../format/errors.js';
import { waitForRun } from '../review/wait.js';
import type { ToolCallExtra, ToolContext, ToolDefinition } from './registry.js';

const DESCRIPTION =
  'Run one DevDigest reviewer agent on one pull request and return its findings. Does the whole job: starts the run, waits for it, returns {verdict, score, findings}. There is no separate start or poll call.';

const inputSchema = {
  repo: z.string().describe('owner/name, or just the repository name'),
  pr: z.number().int().positive().describe('GitHub pull request number'),
  agent: z.string().describe('reviewer agent name, exactly as list_agents returns it'),
  min_severity: Severity.optional().describe('return only findings at or above this severity'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('max findings to return; default 20'),
};

interface RunAgentOnPrArgs {
  repo: string;
  pr: number;
  agent: string;
  min_severity?: Severity;
  limit?: number;
}

async function handler(
  ctx: ToolContext,
  rawArgs: unknown,
  extra: ToolCallExtra,
): Promise<ToolErrorResult> {
  const { repo, pr, agent, min_severity, limit } = rawArgs as RunAgentOnPrArgs;

  let repoDisplay: string | undefined;
  try {
    const repoRow = await ctx.resolver.resolveRepo(repo, extra.signal);
    repoDisplay = repoRow.full_name;
    const repoName = repoRow.full_name;

    const prId = await ctx.resolver.resolvePr(repoRow.id, pr, extra.signal);
    const agentRow = await ctx.resolver.resolveAgent(agent, extra.signal);

    const started = await ctx.api.startReview(prId, agentRow.id, extra.signal);
    const [firstRun] = started;
    if (firstRun === undefined) {
      return reviewStartedNoRun(agentRow.name);
    }
    const runId = firstRun.run_id;

    const waitResult = await waitForRun({
      pollRuns: () => ctx.api.listRuns(prId, extra.signal),
      runId,
      budgetMs: ctx.config.waitBudgetMs,
      now: ctx.now,
      sleep: ctx.sleep,
      signal: extra.signal,
      ...(extra.onProgress
        ? {
            onProgress: (progress) =>
              extra.onProgress?.({
                progress: progress.elapsedMs,
                total: progress.totalMs,
                message: progress.message,
              }),
          }
        : {}),
    });

    if (waitResult.kind === 'done') {
      const reviews = await ctx.api.listReviews(prId, extra.signal);
      const review = reviews.find((candidate) => candidate.run_id === runId);
      if (review === undefined) {
        return shapeMismatch('GET', `/pulls/${prId}/reviews`, `matching review for run_id ${runId}`);
      }
      const { shown } = selectFindings(review.findings, {
        ...(min_severity !== undefined ? { minSeverity: min_severity } : {}),
        limit: limit ?? DEFAULT_LIMIT,
      });
      return {
        isError: false,
        text: capPayload({
          verdict: review.verdict,
          score: review.score,
          run_id: runId,
          findings: toFindingsPayload(shown),
        }),
      };
    }

    if (waitResult.kind === 'failed') {
      return runFailed(
        waitResult.run.status === 'cancelled' ? 'cancelled' : 'failed',
        waitResult.run.error ?? 'unknown error',
      );
    }

    if (waitResult.kind === 'budget_exceeded') {
      return waitBudgetExceeded(repoName, pr, runId, Math.round(waitResult.elapsedMs / 1000));
    }

    return {
      isError: false,
      text: capPayload({
        status: 'cancelled',
        run_id: runId,
        hint: `the tool call was cancelled while waiting; call get_findings(repo="${repoName}", pr=${pr}, run_id="${runId}") to check whether the run finished`,
      }),
    };
  } catch (err) {
    return ctx.mapError(err, repoDisplay);
  }
}

export const runAgentOnPrTool: ToolDefinition = {
  name: 'run_agent_on_pr',
  description: DESCRIPTION,
  inputSchema,
  handler,
};
