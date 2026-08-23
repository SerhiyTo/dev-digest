import {
  Onboarding,
  type FeatureModelId,
  type FeatureModelResolver,
  type LLMProvider,
  type OnboardingView,
  type Provider,
  type RepoRef,
} from '@devdigest/shared';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { applyCaps, degradedFromIndexStatus, isStale, validateSectionKinds } from './domain.js';
import { assembleOnboardingFacts } from './facts.js';
import {
  GeneratedTour,
  buildUserMessage,
  groundSection,
  renderSectionsPlaceholder,
  sortSectionsByKindOrder,
  toOnboardingView,
} from './helpers.js';
import type { GenerationStore, GitReader, Logger, RepoFacts, RepoRefStore, TourStore } from './ports.js';

const ONBOARDING_FEATURE_MODEL_ID: FeatureModelId = 'onboarding';
const ONBOARDING_PROMPT_TEMPLATE = 'onboarding.system.md';
const ONBOARDING_SCHEMA_NAME = 'onboarding_tour';
const ONBOARDING_LANGUAGE = 'English';
const ONBOARDING_MAX_RETRIES = 2;
const ONBOARDING_TIMEOUT_MS = 240_000;
const REAPER_ERROR_MESSAGE = 'Server restarted while a generation was running.';

export interface OnboardingServiceDeps {
  repoRefs: RepoRefStore;
  tours: TourStore;
  generations: GenerationStore;
  facts: RepoFacts;
  git: GitReader;
  featureModels: FeatureModelResolver;
  llm: (provider: Provider) => Promise<LLMProvider>;
  logger?: Logger;
}

export class OnboardingService {
  constructor(private readonly deps: OnboardingServiceDeps) {}

  async getView(workspaceId: string, repoId: string): Promise<OnboardingView> {
    const repo = await this.deps.repoRefs.getRepoRef(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    const [tourRow, state, indexState, resolvedModel] = await Promise.all([
      this.deps.tours.readTour(repoId),
      this.deps.generations.readState(repoId),
      this.deps.facts.getIndexState(repoId),
      this.deps.featureModels.resolve(workspaceId, ONBOARDING_FEATURE_MODEL_ID),
    ]);

    const view = toOnboardingView({
      tourRow,
      state,
      currentSha: indexState.lastIndexedSha || null,
      resolvedModel: resolvedModel.model,
    });

    if (isStale(view.generated_sha, view.current_sha)) {
      this.deps.logger?.info({ repoId }, 'onboarding: displayed tour is older than the current index');
    }

    return view;
  }

  async beginGeneration(workspaceId: string, repoId: string): Promise<void> {
    const repo = await this.deps.repoRefs.getRepoRef(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    const indexState = await this.deps.facts.getIndexState(repoId);
    if (!indexState.lastIndexedSha) {
      throw new ConflictError('Repository has not been indexed yet; index it before generating a tour.');
    }

    const started = await this.deps.generations.beginGeneration({ repoId, workspaceId });
    if (!started) {
      throw new ConflictError('A generation is already running for this repository.');
    }
  }

  async runGeneration(workspaceId: string, repoId: string): Promise<void> {
    const startedAt = Date.now();
    let provider: Provider | null = null;
    let model: string | null = null;

    try {
      this.deps.logger?.info({ repoId, workspaceId }, 'onboarding: generation started');

      const repo = await this.deps.repoRefs.getRepoRef(workspaceId, repoId);
      if (!repo) throw new Error('repository no longer exists');

      const indexState = await this.deps.facts.getIndexState(repoId);
      if (!indexState.lastIndexedSha) throw new Error('repository index is missing');

      const resolved = await this.deps.featureModels.resolve(workspaceId, ONBOARDING_FEATURE_MODEL_ID);
      provider = resolved.provider;
      model = resolved.model;

      const repoRef: RepoRef = { owner: repo.owner, name: repo.name };
      const [facts, indexedPathList] = await Promise.all([
        assembleOnboardingFacts(this.deps.facts, this.deps.git, repoRef, repoId),
        this.deps.facts.getIndexedPaths(repoId),
      ]);
      const indexedPaths = new Set(indexedPathList);

      const llm = await this.deps.llm(provider);
      const systemPrompt = await renderPrompt(ONBOARDING_PROMPT_TEMPLATE, {
        sections: renderSectionsPlaceholder(),
        language: ONBOARDING_LANGUAGE,
      });

      const result = await llm.completeStructured({
        model,
        schema: GeneratedTour,
        schemaName: ONBOARDING_SCHEMA_NAME,
        timeoutMs: ONBOARDING_TIMEOUT_MS,
        maxRetries: ONBOARDING_MAX_RETRIES,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserMessage(facts.block) },
        ],
      });

      const kindCheck = validateSectionKinds(result.data.sections.map((section) => section.kind));
      if (!kindCheck.ok) {
        await this.deps.generations.failGeneration(repoId, {
          provider,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          error: kindCheck.reason,
        });
        return;
      }

      const orderedSections = sortSectionsByKindOrder(result.data.sections);
      const grounded = orderedSections.map((section) => groundSection(section, indexedPaths, facts.citableNumbers));
      for (const outcome of grounded) {
        if (outcome.droppedCount > 0) {
          this.deps.logger?.warn(
            { repoId, kind: outcome.kind, droppedCount: outcome.droppedCount, sample: outcome.droppedSample },
            'onboarding: dropped ungrounded entries',
          );
        }
      }

      const { degraded, reason: degradedReason } = degradedFromIndexStatus(indexState.status);
      const capped = applyCaps({
        sections: grounded.map((outcome) => outcome.section),
        degraded,
        degraded_reason: degradedReason,
      });

      const finalCheck = Onboarding.safeParse(capped);
      if (!finalCheck.success) {
        await this.deps.generations.failGeneration(repoId, {
          provider,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          error: `generated tour failed final validation: ${finalCheck.error.message}`,
        });
        return;
      }

      await this.deps.tours.upsertTour({
        repoId,
        tour: finalCheck.data,
        filesIndexed: indexState.filesIndexed,
        indexedSha: indexState.lastIndexedSha,
        model: result.model,
        costUsd: result.costUsd,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });

      await this.deps.generations.finishGeneration(repoId, {
        provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        degradedReason,
      });

      this.deps.logger?.info(
        {
          repoId,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          durationMs: Date.now() - startedAt,
          degraded,
          documentBytes: Buffer.byteLength(JSON.stringify(finalCheck.data), 'utf8'),
        },
        'onboarding: generation finished',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'onboarding generation failed';
      await this.deps.generations.failGeneration(repoId, {
        provider,
        model,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
        error: message,
      });
      this.deps.logger?.error({ repoId, err: message }, 'onboarding: generation failed');
    }
  }

  async reapRunning(): Promise<number> {
    const count = await this.deps.generations.reapRunning(REAPER_ERROR_MESSAGE);
    this.deps.logger?.info({ count }, 'onboarding: reaped running generations at boot');
    return count;
  }
}
