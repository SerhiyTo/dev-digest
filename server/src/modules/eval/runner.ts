import type { LLMProvider, Provider } from '@devdigest/shared';
import { aggregateEvalRun, reviewPullRequest, scoreEvalCase, type EvalCaseScore } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { NotFoundError } from '../../platform/errors.js';
import { EVAL_CASE_TIMEOUT_MS } from './constants.js';
import type {
  AgentConfigSource,
  EvalCaseStore,
  EvalRunStore,
  EvalSuiteRunStore,
  RunSingleCaseExecution,
  StartSuiteExecution,
  StoredEvalCase,
  SuiteExecutor,
} from './ports.js';

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

export interface EvalRunnerDeps {
  caseStore: EvalCaseStore;
  runStore: EvalRunStore;
  suiteRunStore: EvalSuiteRunStore;
  agentConfig: AgentConfigSource;
  llm: (provider: Provider) => Promise<LLMProvider>;
  logger?: Logger;
}

interface CaseExecutionResult {
  score: EvalCaseScore;
  costUsd: number | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Eval case timed out after ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export class EvalRunner implements SuiteExecutor {
  private readonly cancelled = new Set<string>();

  constructor(private readonly deps: EvalRunnerDeps) {}

  startSuite(input: StartSuiteExecution): void {
    void this.runSuite(input).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'eval suite run crashed';
      this.deps.logger?.error(
        { suiteRunId: input.suiteRunId, agentId: input.agentId, err: message },
        'eval: suite run crashed',
      );
    });
  }

  cancelSuite(suiteRunId: string): void {
    this.cancelled.add(suiteRunId);
  }

  async runSingleCase(input: RunSingleCaseExecution): Promise<void> {
    const { workspaceId, agentId, caseId, agentVersion } = input;
    const kase = await this.deps.caseStore.getCaseById(workspaceId, caseId);
    if (!kase) throw new NotFoundError('Eval case not found');
    await this.executeCase(workspaceId, agentId, agentVersion, kase, null);
  }

  private async runSuite(input: StartSuiteExecution): Promise<void> {
    const { workspaceId, agentId, suiteRunId, agentVersion } = input;
    const start = Date.now();
    let totalCost = 0;
    let hadCost = false;
    const scores: EvalCaseScore[] = [];

    try {
      const cases = await this.deps.caseStore.listCasesByOwner(workspaceId, 'agent', agentId);
      for (const kase of cases) {
        if (this.cancelled.has(suiteRunId)) break;
        const { score, costUsd } = await this.executeCase(
          workspaceId,
          agentId,
          agentVersion,
          kase,
          suiteRunId,
        );
        scores.push(score);
        if (costUsd !== null) {
          totalCost += costUsd;
          hadCost = true;
        }
      }

      if (this.stopIfCancelled(suiteRunId)) return;

      const aggregate = aggregateEvalRun(scores);
      await this.deps.suiteRunStore.finish(workspaceId, suiteRunId, {
        status: 'done',
        casesPassed: aggregate.casesPassed,
        recall: aggregate.recall,
        precision: aggregate.precision,
        citationAccuracy: aggregate.citationAccuracy,
        costUsd: hadCost ? totalCost : null,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      this.cancelled.delete(suiteRunId);
      const message = err instanceof Error ? err.message : 'eval suite run failed';
      await this.deps.suiteRunStore
        .finish(workspaceId, suiteRunId, {
          status: 'failed',
          casesPassed: null,
          recall: null,
          precision: null,
          citationAccuracy: null,
          costUsd: hadCost ? totalCost : null,
          durationMs: Date.now() - start,
        })
        .catch(() => undefined);
      this.deps.logger?.error({ suiteRunId, agentId, err: message }, 'eval: suite run failed');
    }
  }

  private async executeCase(
    workspaceId: string,
    agentId: string,
    agentVersion: number,
    kase: StoredEvalCase,
    suiteRunId: string | null,
  ): Promise<CaseExecutionResult> {
    const start = Date.now();
    try {
      const snapshot = await this.deps.agentConfig.getVersionSnapshot(
        workspaceId,
        agentId,
        agentVersion,
      );
      if (!snapshot) throw new Error(`agent version ${agentVersion} snapshot not found`);

      const llm = await this.deps.llm(snapshot.provider);
      const diff = parseUnifiedDiff(kase.inputDiff);

      const outcome = await withTimeout(
        reviewPullRequest({
          systemPrompt: snapshot.systemPrompt,
          model: snapshot.model,
          diff,
          llm,
          strategy: snapshot.strategy,
          ...(snapshot.skillBlocks.length ? { skills: snapshot.skillBlocks } : {}),
          task: `Eval case: ${kase.name}`,
          sessionId: `eval:${agentId}:${kase.id}`,
        }),
        EVAL_CASE_TIMEOUT_MS,
      );

      const score = scoreEvalCase(kase.expectedOutput, outcome.review.findings);
      const pass = score.passed;

      await this.deps.runStore.insertRun({
        workspaceId,
        caseId: kase.id,
        actualOutput: outcome.review,
        pass,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citationAccuracy,
        durationMs: Date.now() - start,
        costUsd: outcome.costUsd,
        suiteRunId,
        agentVersion,
      });

      return { score, costUsd: outcome.costUsd };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'eval case failed';
      const failedScore = scoreCaseAsZeroMatches(kase.expectedOutput);

      await this.deps.runStore.insertRun({
        workspaceId,
        caseId: kase.id,
        actualOutput: { error: message },
        pass: false,
        recall: failedScore.recall,
        precision: failedScore.precision,
        citationAccuracy: failedScore.citationAccuracy,
        durationMs: Date.now() - start,
        costUsd: null,
        suiteRunId,
        agentVersion,
      });

      return { score: failedScore, costUsd: null };
    }
  }

  private stopIfCancelled(suiteRunId: string): boolean {
    if (!this.cancelled.has(suiteRunId)) return false;
    this.cancelled.delete(suiteRunId);
    return true;
  }
}

function scoreCaseAsZeroMatches(expectedOutput: Parameters<typeof scoreEvalCase>[0]): EvalCaseScore {
  return { ...scoreEvalCase(expectedOutput, []), passed: false };
}
