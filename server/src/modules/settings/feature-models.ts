import type { FeatureModelChoice, FeatureModelId } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import {
  SettingsFeatureModelResolver,
  defaultFeatureModel as registryDefault,
} from '../../adapters/settings/feature-models.js';

/**
 * Per-feature model configuration.
 *
 * System LLM features (onboarding, intent, risk brief, conformance, conventions)
 * read their provider/model from the workspace's Settings instead of a hardcoded
 * module constant. When the workspace hasn't chosen one, we fall back to the
 * registry default in `FEATURE_MODELS` — which mirrors each module's old
 * constant, so behaviour is unchanged until a model is explicitly picked.
 */

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return registryDefault(id);
}

/**
 * The workspace's override for `id`, or `undefined` when unset/invalid. Callers
 * that keep their own dynamic default use this directly so that default is
 * preserved; callers with a static default — every one today, including
 * conventions — use `resolveFeatureModel` instead.
 */
export async function getFeatureModelOverride(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice | undefined> {
  return new SettingsFeatureModelResolver(container.db).override(workspaceId, id);
}

/** Resolve `id` to a concrete provider+model: workspace override, else registry default. */
export async function resolveFeatureModel(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice> {
  return new SettingsFeatureModelResolver(container.db).resolve(workspaceId, id);
}
