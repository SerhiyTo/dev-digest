import { BlastRadiusResponse } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { assembleBlastModel } from './assemble.js';
import { toBlastRadiusDto } from './helpers.js';
import type { BlastEngine, BlastEngineResult, BlastStore, Logger } from './ports.js';

export interface BlastServiceDeps {
  store: BlastStore;
  engine: BlastEngine;
  logger?: Logger;
}

export class BlastService {
  constructor(private deps: BlastServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<BlastRadiusResponse | undefined> {
    const pull = await this.deps.store.getPullSummary(workspaceId, prId);
    if (!pull) return undefined;

    const log = this.deps.logger;
    const changedPaths = await this.deps.store.getChangedPaths(prId);

    const noFiles = changedPaths.length === 0;
    const engineResult: BlastEngineResult = noFiles
      ? {
          changedSymbols: [],
          callers: [],
          impactedEndpoints: [],
          degraded: true,
          reason: 'no_files',
        }
      : await this.deps.engine.getBlastRadius(pull.repoId, changedPaths);

    const model = assembleBlastModel(engineResult, log);
    const history = noFiles
      ? []
      : await this.deps.store.getPriorPrs(workspaceId, pull.repoId, prId, changedPaths);

    const dto = toBlastRadiusDto(model, history);
    const parsed = BlastRadiusResponse.safeParse(dto);
    if (!parsed.success) {
      log?.error({ prId, issues: parsed.error.issues }, 'blast: response failed its own contract');
      throw new AppError('internal_error', 'Blast radius failed its own contract', 500);
    }

    log?.info(
      {
        prId,
        symbols: model.changedSymbols.length,
        downstream: model.downstream.length,
        historyCount: history.length,
        degraded: model.degraded,
        truncated: model.truncated,
      },
      'blast: computed',
    );

    return parsed.data;
  }
}
