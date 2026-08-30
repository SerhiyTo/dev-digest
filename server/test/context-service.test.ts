import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import type { CloneDocRead } from '@devdigest/shared';
import { FsCloneDocs, MAX_DOC_BYTES } from '../src/adapters/clonedocs/index.js';
import { ContextService } from '../src/modules/context/service.js';
import {
  DOC_EXTENSIONS,
  DOC_ROOTS,
  EXCLUDED_DIRS,
  MAX_DOC_CHARS,
  MAX_DOCUMENTS,
  TRUNCATION_MARKER,
} from '../src/modules/context/constants.js';
import { isProjectDocPath } from '../src/modules/context/paths.js';
import type {
  ContextRepoRow,
  DefaultBranchDocs,
  DocStore,
} from '../src/modules/context/ports.js';
import * as t from '../src/db/schema.js';

/**
 * The document cap and the attachment storage shape, without Postgres.
 *
 * `MAX_DOCUMENTS` and the `omitted` arithmetic moved out of `CloneDocsSource`
 * and into `ContextService` (plan amendment A1), so `context-discovery.test.ts`
 * — which asserts the adapter returns everything uncapped — no longer observes
 * AC-4 at all. These cases are the only place the cap is proven.
 */

const REPO: ContextRepoRow = {
  id: 'repo-1',
  owner: 'acme',
  name: 'payments-api',
  fullName: 'acme/payments-api',
  defaultBranch: 'main',
  clonePath: '/clones/acme/payments-api',
};

const NOT_A_PROJECT_DOC = [
  'README.md',
  'src/notes.md',
  'docs/diagram.png',
  'docs/notes.txt',
  '../../etc/passwd',
];

function docPath(i: number): string {
  return `docs/doc-${String(i).padStart(4, '0')}.md`;
}

function ascending(count: number): string[] {
  return Array.from({ length: count }, (_, i) => docPath(i));
}

function store(overrides: Partial<DocStore> = {}): DocStore {
  return {
    getRepo: async () => REPO,
    ownerExists: async () => true,
    attachments: async () => [],
    setAttachments: async () => {},
    agentsReachingDocs: async () => [],
    agentPathsInAttachmentOrder: async () => [],
    skillPathsInLinkOrder: async () => [],
    ...overrides,
  };
}

interface RecordingDocs extends DefaultBranchDocs {
  listedRoots: string[];
  readRoots: string[];
}

function docs(
  paths: readonly string[],
  reads: Record<string, CloneDocRead> = {},
): RecordingDocs {
  const listedRoots: string[] = [];
  const readRoots: string[] = [];
  return {
    listedRoots,
    readRoots,
    list: async (cloneRoot) => {
      listedRoots.push(cloneRoot);
      return paths.map((path) => ({ path }));
    },
    read: async (cloneRoot, path) => {
      readRoots.push(cloneRoot);
      return reads[path] ?? { ok: false, reason: 'missing' };
    },
  };
}

function listing(paths: readonly string[]) {
  const service = new ContextService({
    store: store(),
    docs: docs(paths),
    tokens: { count: (text) => text.length },
  });
  return service.list('ws-1', REPO.id);
}

describe('ContextService.list — the discovery cap (AC-4)', () => {
  it('returns the first MAX_DOCUMENTS in ascending path order and reports the rest as omitted', async () => {
    const overflow = 5;
    const body = await listing(ascending(MAX_DOCUMENTS + overflow));

    expect(body.documents).toHaveLength(MAX_DOCUMENTS);
    expect(body.omitted).toBe(overflow);

    const returned = body.documents.map((doc) => doc.path);
    expect(returned[0]).toBe(docPath(0));
    expect(returned.at(-1)).toBe(docPath(MAX_DOCUMENTS - 1));
    expect(returned).toEqual([...returned].sort());
    expect(returned).not.toContain(docPath(MAX_DOCUMENTS));
    expect(returned).not.toContain(docPath(MAX_DOCUMENTS + overflow - 1));
  });

  it('reports nothing omitted for a repository sitting exactly on the cap', async () => {
    const body = await listing(ascending(MAX_DOCUMENTS));

    expect(body.documents).toHaveLength(MAX_DOCUMENTS);
    expect(body.omitted).toBe(0);
    expect(body.reason).toBeNull();
  });

  it('counts only matching documents toward the cap, never the paths the roots reject', async () => {
    const overflow = 5;
    const mixed = [...NOT_A_PROJECT_DOC, ...ascending(MAX_DOCUMENTS + overflow)];

    const body = await listing(mixed);

    expect(body.documents).toHaveLength(MAX_DOCUMENTS);
    expect(body.omitted).toBe(overflow);
    expect(body.documents.map((doc) => doc.path)).not.toContain('README.md');
  });

  it('leaves a repository under the cap untouched', async () => {
    const body = await listing(ascending(3));

    expect(body.documents.map((doc) => doc.path)).toEqual([docPath(0), docPath(1), docPath(2)]);
    expect(body.omitted).toBe(0);
  });
});

describe('ContextService reads the clone root the repo row stores', () => {
  it('hands the stored clone_path to the walk instead of letting the port derive one', async () => {
    const source = docs([docPath(0)]);
    const service = new ContextService({
      store: store(),
      docs: source,
      tokens: { count: (text) => text.length },
    });

    await service.list('ws-1', REPO.id);
    expect(source.listedRoots).toEqual([REPO.clonePath]);

    await service.estimate('ws-1', REPO.id, [docPath(0)]);
    expect(source.readRoots).toEqual([REPO.clonePath]);
  });

  it('skips every attachment rather than guessing a root when there is no clone', async () => {
    const source = docs([docPath(0)], { [docPath(0)]: { ok: true, text: '# doc' } });
    const service = new ContextService({
      store: store({ agentPathsInAttachmentOrder: async () => [docPath(0)] }),
      docs: source,
      tokens: { count: (text) => text.length },
    });

    const resolved = await service.resolveForRun('agent-1', {
      owner: REPO.owner,
      name: REPO.name,
      clonePath: null,
    });

    expect(source.readRoots).toEqual([]);
    expect(resolved).toEqual({
      specs: [],
      specsRead: [],
      skipped: [{ path: docPath(0), reason: 'unreadable' }],
    });
  });
});

describe('ContextService.document — the 404 the read itself names (AC-9)', () => {
  function serving(reads: Record<string, CloneDocRead>) {
    const source = docs([docPath(0), docPath(1)], reads);
    const service = new ContextService({
      store: store(),
      docs: source,
      tokens: { count: (text) => text.length },
    });
    return { service, source };
  }

  it('returns the body when the read succeeds', async () => {
    const { service } = serving({ [docPath(0)]: { ok: true, text: '# ok' } });

    await expect(service.document('ws-1', REPO.id, docPath(0))).resolves.toEqual({
      path: docPath(0),
      content: '# ok',
      truncated: false,
    });
  });

  it('answers not_found for a missing document without walking the tree again', async () => {
    const { service, source } = serving({ [docPath(0)]: { ok: false, reason: 'missing' } });

    await expect(service.document('ws-1', REPO.id, docPath(0))).rejects.toMatchObject({
      code: 'not_found',
      statusCode: 404,
    });
    expect(source.listedRoots).toEqual([]);
  });

  it.each([
    ['unreadable' as const],
    ['out_of_root' as const],
  ])('answers document_unreadable for a %s document without walking the tree again', async (reason) => {
    const { service, source } = serving({ [docPath(0)]: { ok: false, reason } });

    await expect(service.document('ws-1', REPO.id, docPath(0))).rejects.toMatchObject({
      code: 'document_unreadable',
      statusCode: 404,
    });
    expect(source.listedRoots).toEqual([]);
  });
});

describe('the attachment tables store a path and nothing else (AC-12)', () => {
  it('gives agent_docs exactly the owner, the path and the order index', () => {
    expect(Object.keys(getTableColumns(t.agentDocs)).sort()).toEqual([
      'agentId',
      'order',
      'path',
    ]);
  });

  it('gives skill_docs exactly the owner, the path and the order index', () => {
    expect(Object.keys(getTableColumns(t.skillDocs)).sort()).toEqual([
      'order',
      'path',
      'skillId',
    ]);
  });
});

describe('a document above the byte ceiling is listed, attachable and injected truncated (AC-33)', () => {
  const OVERSIZED = 'docs/huge.md';

  let cloneDir: string;
  let clone: string;
  let attached: string[];
  let service: ContextService;

  beforeEach(async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'context-oversized-'));
    clone = join(cloneDir, REPO.owner, REPO.name);
    await mkdir(join(clone, 'docs'), { recursive: true });
    await writeFile(join(clone, OVERSIZED), 'A'.repeat(MAX_DOC_BYTES * 2));

    attached = [];
    service = new ContextService({
      store: store({
        getRepo: async () => ({ ...REPO, clonePath: clone }),
        setAttachments: async (_kind, _ownerId, paths) => {
          attached = [...paths];
        },
        attachments: async () => attached.map((path, order) => ({ path, order })),
        agentPathsInAttachmentOrder: async () => attached,
      }),
      docs: new FsCloneDocs({
        docRoots: DOC_ROOTS,
        docExtensions: DOC_EXTENSIONS,
        excludedDirs: EXCLUDED_DIRS,
        isDocPath: isProjectDocPath,
      }),
      tokens: { count: (text) => text.length },
    });
  });

  afterEach(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  it('lists it, accepts it as an attachment, and truncates it into the block instead of skipping it', async () => {
    const listed = await service.list('ws-1', REPO.id);
    expect(listed.documents.map((doc) => doc.path)).toEqual([OVERSIZED]);

    await expect(
      service.setAttachments('ws-1', 'agent', 'agent-1', [OVERSIZED]),
    ).resolves.toEqual([{ path: OVERSIZED, order: 0 }]);

    const resolved = await service.resolveForRun('agent-1', {
      owner: REPO.owner,
      name: REPO.name,
      clonePath: clone,
    });

    expect(resolved.skipped).toEqual([]);
    expect(resolved.specsRead).toEqual([OVERSIZED]);
    expect(resolved.specs).toEqual([
      `${OVERSIZED}\n\n${'A'.repeat(MAX_DOC_CHARS)}\n${TRUNCATION_MARKER}`,
    ]);
  });

  it('tells the preview that the body it returns is only the first part', async () => {
    const body = await service.document('ws-1', REPO.id, OVERSIZED);

    expect(body.truncated).toBe(true);
    expect(body.content.length).toBe(MAX_DOC_BYTES);
  });
});
