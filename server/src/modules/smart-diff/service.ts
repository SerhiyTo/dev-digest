import type { SmartDiff } from '@devdigest/shared';
import { SmartDiffResponse } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { buildSmartDiffModel } from './classify.js';
import { MAX_LOGGED_ORPHAN_SAMPLES } from './constants.js';
import { toSmartDiffDto } from './helpers.js';
import type { Logger, SmartDiffStore } from './ports.js';

export interface SmartDiffServiceDeps {
  store: SmartDiffStore;
  logger?: Logger;
}

export class SmartDiffService {
  constructor(private deps: SmartDiffServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiff | undefined> {
    const pull = await this.deps.store.getPullSummary(workspaceId, prId);
    if (!pull) return undefined;

    const log = this.deps.logger;
    const [files, latest] = await Promise.all([
      this.deps.store.getFiles(prId),
      this.deps.store.getLatestReviewFindings(prId),
    ]);

    const model = buildSmartDiffModel(files, latest.findings);
    const { stats } = model;

    if (files.length === 0) {
      log?.warn({ prId }, 'smart-diff: pull request has no files');
    }

    if (latest.fellBackToSummary) {
      log?.warn(
        { prId, reviewId: latest.reviewId, kind: latest.kind },
        'smart-diff: no review-kind review; using latest summary',
      );
    }

    if (stats.duplicatePaths.length > 0) {
      log?.warn(
        {
          prId,
          count: stats.duplicatePaths.length,
          sample: stats.duplicatePaths.slice(0, MAX_LOGGED_ORPHAN_SAMPLES),
        },
        'smart-diff: duplicate pr_files path dropped',
      );
    }

    if (stats.orphanFiles.length > 0) {
      log?.warn(
        {
          prId,
          reviewId: latest.reviewId,
          count: stats.orphanFiles.length,
          sample: stats.orphanFiles.slice(0, MAX_LOGGED_ORPHAN_SAMPLES),
        },
        'smart-diff: findings reference files absent from the diff',
      );
    }

    for (const dropped of latest.droppedSeverities) {
      log?.warn(
        { prId, reviewId: latest.reviewId, severity: dropped.severity, count: dropped.count },
        'smart-diff: unknown finding severity ignored',
      );
    }

    if (stats.clampedFindings > 0) {
      log?.warn(
        { prId, reviewId: latest.reviewId, count: stats.clampedFindings },
        'smart-diff: finding line span clamped',
      );
    }

    const dto = toSmartDiffDto(model);
    const parsed = SmartDiffResponse.safeParse(dto);
    if (!parsed.success) {
      log?.error(
        { prId, issues: parsed.error.issues },
        'smart-diff: response failed its own contract',
      );
      throw new AppError('internal_error', 'Smart diff failed its own contract', 500);
    }

    const counts = { core: 0, wiring: 0, boilerplate: 0 };
    for (const group of model.groups) counts[group.role] = group.files.length;

    log?.info(
      {
        prId,
        reviewId: latest.reviewId,
        files: files.length,
        core: counts.core,
        wiring: counts.wiring,
        boilerplate: counts.boilerplate,
        findingFiles: stats.findingFiles,
        findingLines: stats.findingLines,
        totalLines: stats.totalLines,
        reviewableLines: stats.reviewableLines,
        tooBig: model.split.too_big,
        splits: model.split.proposed_splits.length,
      },
      'smart-diff: computed',
    );

    return parsed.data;
  }
}
