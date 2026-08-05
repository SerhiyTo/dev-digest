import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import {
  hasWritableField,
  isBodyChange,
  restoredFromLabel,
  toSkillDto,
  toSkillVersionDto,
} from './helpers.js';
import { skillBodyPatch } from './diff.js';
import { getSkillStats } from './stats.js';
import { MANUAL_SKILL_SOURCE } from './constants.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * Skills service. A skill is a standalone block of markdown instructions,
 * versioned on every body change and linked to agents by the agents module.
 *
 * Business rules live here: the creation gate that refuses to trust a foreign
 * skill, and restore semantics that only ever append to the history.
 */

export { toSkillDto } from './helpers.js';

/** A skill as listed on the Skills page: the DTO plus its agent fan-out. */
export interface SkillWithUsage extends Skill {
  used_by: number;
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  /** Server-populated provenance (the conventions extractor); never client input. */
  evidenceFiles?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  version_label?: string;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<SkillWithUsage[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map((r) => ({ ...toSkillDto(r.skill), used_by: r.usedBy }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions/agent links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Create a skill. A skill that did not originate here is always created
   * disabled, whatever the request asked for: only a human, through a later
   * explicit toggle, may let foreign instructions reach a prompt. The server is
   * the gate — the UI only reflects it.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const source = input.source ?? MANUAL_SKILL_SOURCE;
    const enabled = source === MANUAL_SKILL_SOURCE ? (input.enabled ?? true) : false;
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      type: input.type,
      source,
      body: input.body,
      enabled,
      ...(input.evidenceFiles !== undefined ? { evidenceFiles: input.evidenceFiles } : {}),
    });
    return toSkillDto(row);
  }

  /**
   * Update a skill. Two degenerate patches are handled before the write:
   *
   * - A `version_label` that will not land anywhere. A label describes a
   *   `skill_versions` snapshot, and a snapshot is only written when the body
   *   actually changes, so a label without a body change has nothing to attach
   *   to. Accepting it silently would drop it; that is reported instead.
   * - A patch naming no writable column at all. Nothing was asked for, so the
   *   current skill is returned unchanged rather than sent to an empty `SET`.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;

    const fields = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    };

    if (patch.version_label !== undefined && !isBodyChange(existing, fields)) {
      throw new ValidationError(
        'version_label labels a new version, so it requires a change of body',
      );
    }
    if (!hasWritableField(fields)) return toSkillDto(existing);

    const row = await this.repo.update(workspaceId, id, {
      ...fields,
      ...(patch.version_label !== undefined ? { versionLabel: patch.version_label } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Body history for a skill, newest version first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (the route maps that to 404)
   * so snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Unified diff of a past version against the skill's current body, as hunks
   * only — the caller already knows which two versions it asked for. Undefined
   * when the skill isn't in this workspace or that version was never recorded.
   */
  async diffVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<{ patch: string } | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const snapshot = await this.repo.getVersion(skillId, version);
    if (!snapshot) return undefined;
    return { patch: skillBodyPatch(snapshot.body, skill.body) };
  }

  /**
   * Restore an old body by appending it as a NEW version. Nothing in the history
   * is rewritten or dropped, and the new version is auto-labelled so the origin
   * of the restore stays visible. Restoring a body identical to the current one
   * still appends — the simpler invariant, and an honest record of the action.
   */
  async restoreVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const snapshot = await this.repo.getVersion(skillId, version);
    if (!snapshot) return undefined;
    const row = await this.repo.appendVersion(
      workspaceId,
      skillId,
      snapshot.body,
      restoredFromLabel(version),
    );
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Usage + effectiveness aggregates for the Stats tab, computed from the
   * agent links that exist right now (no history of past links is kept).
   * Workspace-scoped: undefined for a skill outside this workspace, same as
   * every other read, so the route can 404 it.
   */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return getSkillStats(this.container.db, workspaceId, id);
  }
}
