import type { SmartDiffRole } from '@devdigest/shared';
import type { FileRoleSource, FileSource } from './ports.js';

export type ClassifyPath = (path: string) => SmartDiffRole;

export class SmartDiffFileRoleSource implements FileRoleSource {
  constructor(
    private readonly files: FileSource,
    private readonly classifyPath: ClassifyPath,
  ) {}

  async get(_workspaceId: string, prId: string): Promise<ReadonlyMap<string, SmartDiffRole> | undefined> {
    const changedFiles = await this.files.getChangedFiles(prId);
    const roles = new Map<string, SmartDiffRole>();
    for (const file of changedFiles) roles.set(file.path, this.classifyPath(file.path));
    return roles;
  }
}
