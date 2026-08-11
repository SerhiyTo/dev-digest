import { eq } from 'drizzle-orm';
import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
  type FeatureModelResolver,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

export class SettingsFeatureModelResolver implements FeatureModelResolver {
  constructor(private db: Db) {}

  async override(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice | undefined> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));

    const bag: Record<string, unknown> = {};
    for (const r of rows) bag[r.key] = r.value;

    const featureModels = bag.feature_models as Record<string, unknown> | undefined;
    const parsed = FeatureModelChoice.safeParse(featureModels?.[id]);
    return parsed.success ? parsed.data : undefined;
  }

  async resolve(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice> {
    return (await this.override(workspaceId, id)) ?? DEFAULTS[id];
  }
}
