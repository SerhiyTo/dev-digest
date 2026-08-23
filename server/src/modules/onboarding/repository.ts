import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  BeginGeneration,
  FailGeneration,
  FinishGeneration,
  GenerationStateRow,
  GenerationStore,
  OnboardingRepoRef,
  OnboardingTourRow,
  RepoRefStore,
  TourStore,
  UpsertTour,
} from './ports.js';

export class OnboardingRepository implements TourStore, GenerationStore, RepoRefStore {
  constructor(private db: Db) {}

  async getRepoRef(workspaceId: string, repoId: string): Promise<OnboardingRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async readTour(repoId: string): Promise<OnboardingTourRow | undefined> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    if (!row) return undefined;
    return {
      repoId: row.repoId,
      tourJson: row.json,
      generatedAt: row.generatedAt,
      filesIndexed: row.filesIndexed,
      indexedSha: row.indexedSha,
      model: row.model,
      costUsd: row.costUsd,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
    };
  }

  async upsertTour(values: UpsertTour): Promise<void> {
    const fresh = {
      json: values.tour,
      generatedAt: new Date(),
      filesIndexed: values.filesIndexed,
      indexedSha: values.indexedSha,
      model: values.model,
      costUsd: values.costUsd,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
    };
    await this.db
      .insert(t.onboarding)
      .values({ repoId: values.repoId, ...fresh })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: fresh });
  }

  async readState(repoId: string): Promise<GenerationStateRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));
    return row;
  }

  async beginGeneration(values: BeginGeneration): Promise<boolean> {
    const fresh = {
      workspaceId: values.workspaceId,
      status: 'running' as const,
      provider: null,
      model: null,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      degradedReason: null,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    const rows = await this.db
      .insert(t.onboardingGenerations)
      .values({ repoId: values.repoId, ...fresh })
      .onConflictDoUpdate({
        target: t.onboardingGenerations.repoId,
        set: fresh,
        setWhere: ne(t.onboardingGenerations.status, 'running'),
      })
      .returning({ repoId: t.onboardingGenerations.repoId });
    return rows.length > 0;
  }

  async finishGeneration(repoId: string, patch: FinishGeneration): Promise<void> {
    await this.db
      .update(t.onboardingGenerations)
      .set({
        status: 'done',
        finishedAt: new Date(),
        provider: patch.provider,
        model: patch.model,
        tokensIn: patch.tokensIn,
        tokensOut: patch.tokensOut,
        costUsd: patch.costUsd,
        degradedReason: patch.degradedReason,
        error: null,
      })
      .where(eq(t.onboardingGenerations.repoId, repoId));
  }

  async failGeneration(repoId: string, patch: FailGeneration): Promise<void> {
    await this.db
      .update(t.onboardingGenerations)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        provider: patch.provider,
        model: patch.model,
        tokensIn: patch.tokensIn,
        tokensOut: patch.tokensOut,
        costUsd: patch.costUsd,
        error: patch.error,
      })
      .where(eq(t.onboardingGenerations.repoId, repoId));
  }

  async reapRunning(error: string): Promise<number> {
    const rows = await this.db
      .update(t.onboardingGenerations)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(eq(t.onboardingGenerations.status, 'running'))
      .returning({ repoId: t.onboardingGenerations.repoId });
    return rows.length;
  }
}
