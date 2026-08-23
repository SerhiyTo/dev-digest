import { z } from 'zod';
import { Severity } from '@devdigest/shared';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants.js';
import { pickRun, selectFindings } from '../domain/select.js';
import { capPayload, toFindingsPayload } from '../format/compact.js';
import type { ToolErrorResult } from '../format/errors.js';
import { noRunsYet, runFailed, runStillRunning, shapeMismatch, unknownRunId } from '../format/errors.js';
import type { ToolCallExtra, ToolContext, ToolDefinition } from './registry.js';

const DESCRIPTION =
  'Return the findings of a review that already finished on this pull request. Pass run_id for a specific run; omit it for the most recent finished one. Not needed right after run_agent_on_pr, which already returns findings.';

const inputSchema = {
  repo: z.string().describe('owner/name, or just the repository name'),
  pr: z.number().int().positive().describe('GitHub pull request number'),
  run_id: z.string().optional().describe('a specific run; omit for the newest finished run on this PR'),
  min_severity: Severity.optional().describe('return only findings at or above this severity'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('max findings to return; default 20'),
};

interface GetFindingsArgs {
  repo: string;
  pr: number;
  run_id?: string;
  min_severity?: Severity;
  limit?: number;
}

async function handler(
  ctx: ToolContext,
  rawArgs: unknown,
  extra: ToolCallExtra,
): Promise<ToolErrorResult> {
  const { repo, pr, run_id, min_severity, limit } = rawArgs as GetFindingsArgs;

  let repoDisplay: string | undefined;
  try {
    const repoRow = await ctx.resolver.resolveRepo(repo, extra.signal);
    repoDisplay = repoRow.full_name;
    const repoName = repoRow.full_name;

    const prId = await ctx.resolver.resolvePr(repoRow.id, pr, extra.signal);

    const runs = await ctx.api.listRuns(prId, extra.signal);
    if (runs.length === 0) {
      return noRunsYet(repoName, pr);
    }

    const run = pickRun(runs, run_id);
    if (run === undefined) {
      const knownRunIds = runs.map((candidate) => candidate.run_id).slice(0, 10);
      return unknownRunId(repoName, pr, String(run_id), knownRunIds);
    }

    if (run.status === 'failed' || run.status === 'cancelled') {
      return runFailed(run.status, run.error ?? 'unknown error');
    }
    if (run.status !== 'done') {
      return runStillRunning(run.run_id);
    }

    const reviews = await ctx.api.listReviews(prId, extra.signal);
    const review = reviews.find((candidate) => candidate.run_id === run.run_id);
    if (review === undefined) {
      return shapeMismatch('GET', `/pulls/${prId}/reviews`, `matching review for run_id ${run.run_id}`);
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
        run_id: run.run_id,
        agent: run.agent_name,
        findings: toFindingsPayload(shown),
      }),
    };
  } catch (err) {
    return ctx.mapError(err, repoDisplay);
  }
}

export const getFindingsTool: ToolDefinition = {
  name: 'get_findings',
  description: DESCRIPTION,
  inputSchema,
  handler,
};
