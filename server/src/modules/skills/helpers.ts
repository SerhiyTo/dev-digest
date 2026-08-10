import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the body-version
 * bump rule, and the auto-label a restore carries. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    label: row.label,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a patch actually changes the skill's body. Only a body change bumps
 * the version and writes a `skill_versions` snapshot — renaming a skill or
 * flipping `enabled` leaves the history alone.
 */
export function isBodyChange(
  existing: Pick<SkillRow, 'body'>,
  patch: { body?: string },
): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

/** The skill columns a `PUT` may write. `version_label` is not one of them —
 *  it lands on the snapshot, never on the skill row. */
export interface SkillPatchFields {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** True when a patch names at least one writable column, i.e. there is
 *  something for the `SET` clause to carry. */
export function hasWritableField(patch: SkillPatchFields): boolean {
  return (
    patch.name !== undefined ||
    patch.description !== undefined ||
    patch.type !== undefined ||
    patch.body !== undefined ||
    patch.enabled !== undefined
  );
}

/** Label written onto the new version a restore appends. */
export function restoredFromLabel(version: number): string {
  return `Restored from v${version}`;
}
