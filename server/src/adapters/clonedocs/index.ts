import { open, readdir, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import type {
  CloneDocEntry,
  CloneDocRead,
  CloneDocReadFailure,
  CloneDocsSource,
} from '@devdigest/shared';

export const MAX_DOC_BYTES = 262_144;
export const MAX_WALK_DEPTH = 10;
export const MAX_WALK_ENTRIES = 20_000;

export interface CloneDocsPolicy {
  docRoots: readonly string[];
  docExtensions: readonly string[];
  excludedDirs: readonly string[];
  isDocPath(path: string): boolean;
  maxDocBytes?: number;
  maxWalkDepth?: number;
  maxWalkEntries?: number;
}

interface WalkBudget {
  entries: number;
}

function byPathAscending(a: CloneDocEntry, b: CloneDocEntry): number {
  if (a.path === b.path) return 0;
  return a.path < b.path ? -1 : 1;
}

function toPosixRelative(root: string, full: string): string {
  return relative(root, full).split(sep).join('/');
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

function unread(reason: CloneDocReadFailure): CloneDocRead {
  return { ok: false, reason };
}

function withoutPartialUtf8Tail(buffer: Buffer): Buffer {
  for (let back = 0; back < 4 && back < buffer.length; back += 1) {
    const index = buffer.length - 1 - back;
    const byte = buffer[index] ?? 0;
    if ((byte & 0b1100_0000) === 0b1000_0000) continue;
    const width = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return width === back + 1 ? buffer : buffer.subarray(0, index);
  }
  return buffer;
}

async function readDirSafe(dir: string): Promise<Dirent[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    return [];
  }
}

export class FsCloneDocs implements CloneDocsSource {
  private docRoots: ReadonlySet<string>;
  private docExtensions: ReadonlySet<string>;
  private excludedDirs: ReadonlySet<string>;
  private maxDocBytes: number;
  private maxWalkDepth: number;
  private maxWalkEntries: number;

  constructor(private policy: CloneDocsPolicy) {
    this.docRoots = new Set(policy.docRoots);
    this.docExtensions = new Set(policy.docExtensions);
    this.excludedDirs = new Set(policy.excludedDirs);
    this.maxDocBytes = policy.maxDocBytes ?? MAX_DOC_BYTES;
    this.maxWalkDepth = policy.maxWalkDepth ?? MAX_WALK_DEPTH;
    this.maxWalkEntries = policy.maxWalkEntries ?? MAX_WALK_ENTRIES;
  }

  async list(cloneRoot: string): Promise<CloneDocEntry[]> {
    const out: CloneDocEntry[] = [];
    const budget: WalkBudget = { entries: this.maxWalkEntries };

    for (const entry of await readDirSafe(cloneRoot)) {
      if (budget.entries <= 0) break;
      budget.entries -= 1;
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      if (!this.docRoots.has(entry.name.toLowerCase())) continue;
      await this.collect(cloneRoot, join(cloneRoot, entry.name), 1, budget, out);
    }

    return out.sort(byPathAscending);
  }

  async read(cloneRoot: string, path: string): Promise<CloneDocRead> {
    if (!this.policy.isDocPath(path)) return unread('invalid_path');

    let root: string;
    let target: string;
    try {
      root = await realpath(cloneRoot);
      target = await realpath(join(root, path));
    } catch {
      return unread('missing');
    }
    if (!isInside(root, target)) return unread('out_of_root');

    try {
      const seen = await stat(target);
      if (!seen.isFile()) return unread('unreadable');
      return await this.readBoundedPrefix(target);
    } catch {
      return unread('unreadable');
    }
  }

  private async readBoundedPrefix(target: string): Promise<CloneDocRead> {
    const handle = await open(target, 'r');
    try {
      const { size } = await handle.stat();
      const truncated = size > this.maxDocBytes;
      const wanted = truncated ? this.maxDocBytes : size;
      const buffer = Buffer.alloc(wanted);
      const { bytesRead } = await handle.read(buffer, 0, wanted, 0);
      const read = buffer.subarray(0, bytesRead);
      const prefix = truncated ? withoutPartialUtf8Tail(read) : read;
      return { ok: true, text: prefix.toString('utf8'), truncated };
    } finally {
      await handle.close();
    }
  }

  private async collect(
    root: string,
    dir: string,
    depth: number,
    budget: WalkBudget,
    out: CloneDocEntry[],
  ): Promise<void> {
    if (depth > this.maxWalkDepth) return;

    for (const entry of await readDirSafe(dir)) {
      if (budget.entries <= 0) return;
      budget.entries -= 1;
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (this.excludedDirs.has(entry.name)) continue;
        await this.collect(root, join(dir, entry.name), depth + 1, budget, out);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!this.docExtensions.has(extname(entry.name).toLowerCase())) continue;

      const path = toPosixRelative(root, join(dir, entry.name));
      if (!this.policy.isDocPath(path)) continue;
      out.push({ path });
    }
  }
}
