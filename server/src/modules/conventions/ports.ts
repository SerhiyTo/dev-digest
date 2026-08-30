import type { Skill, SkillSource, SkillType } from '@devdigest/shared';

export interface ConventionSkillWrite {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  evidenceFiles?: string[];
}

export interface ConventionSkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

export interface ConventionsSkillsPort {
  create(workspaceId: string, input: ConventionSkillWrite): Promise<Skill>;
  update(
    workspaceId: string,
    id: string,
    patch: ConventionSkillPatch,
  ): Promise<Skill | undefined>;
}
