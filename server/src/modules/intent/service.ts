import type { PrIntentRecord } from '@devdigest/shared';
import {
  MAX_DOC_BYTES,
  MAX_DOC_TOTAL_BYTES,
  MAX_ISSUE_BODY_CHARS,
  MAX_LINK_TOTAL_BYTES,
} from './constants.js';
import { gatherEvidence, scoreConfidence } from './confidence.js';
import { intentRowToRecord } from './helpers.js';
import type {
  DocSource,
  FetchedDoc,
  FetchedIssue,
  FetchedLink,
  IntentClassifier,
  IntentPull,
  IntentStore,
  IssueSource,
  LinkSource,
  Logger,
} from './ports.js';
import {
  extractDocReferences,
  extractExternalReferences,
  extractIssueReferences,
  extractLinkReferences,
  type IssueReference,
  type LinkReference,
} from './references.js';

export interface IntentServiceDeps {
  store: IntentStore;
  docs: DocSource;
  issues: IssueSource;
  links: LinkSource;
  classifier: IntentClassifier;
  logger?: Logger;
}

export class IntentService {
  constructor(private deps: IntentServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | undefined> {
    const pull = await this.deps.store.getPull(workspaceId, prId);
    if (!pull) return undefined;
    const row = await this.deps.store.getIntentRow(prId);
    return row ? intentRowToRecord(row, pull) : undefined;
  }

  async compute(workspaceId: string, prId: string): Promise<PrIntentRecord | undefined> {
    const pull = await this.deps.store.getPull(workspaceId, prId);
    if (!pull) return undefined;

    const log = this.deps.logger;
    const body = pull.body ?? '';
    const docReferences = extractDocReferences(body);
    const issueReferences = extractIssueReferences(body);
    const linkReferences = extractLinkReferences(body);
    const externalReferences = extractExternalReferences(body);

    log?.info(
      {
        prId,
        docs: docReferences.length,
        issues: issueReferences.length,
        links: linkReferences.length,
      },
      'intent: references extracted',
    );

    const [docs, issues, links, changedPaths, commitMessages] = await Promise.all([
      this.readDocs(pull, docReferences.map((d) => d.path), log),
      this.readIssues(pull, issueReferences, log),
      this.readLinks(workspaceId, linkReferences, log),
      this.deps.store.getFilePaths(prId),
      this.deps.store.getCommitMessages(prId),
    ]);

    const startedAt = Date.now();
    const classification = await this.deps.classifier.classify(workspaceId, {
      title: pull.title,
      body: pull.body,
      branch: pull.branch,
      changedPaths,
      commitMessages,
      docs,
      issues,
      links,
    });
    log?.info(
      {
        prId,
        model: classification.model,
        tokensIn: classification.tokensIn,
        tokensOut: classification.tokensOut,
        costUsd: classification.costUsd,
        durationMs: Date.now() - startedAt,
      },
      'intent: classified',
    );

    const evidence = gatherEvidence({
      title: pull.title,
      body: pull.body,
      branch: pull.branch,
      changedPaths,
      commitMessages,
      docReferences,
      docsRead: docs.map((d) => d.path),
      issueReferences,
      issuesRead: issues.map((i) => i.ref),
      linkReferences,
      linksRead: links.map((l) => l.url),
      externalReferences,
    });
    const confidence = scoreConfidence(evidence);
    log?.info(
      { prId, confidence, signals: evidence.map((e) => e.kind) },
      'intent: confidence derived from evidence',
    );

    await this.deps.store.upsertIntent({
      prId,
      intent: classification.data.intent,
      inScope: classification.data.in_scope,
      outOfScope: classification.data.out_of_scope,
      riskAreas: classification.data.risk_areas,
      evidence,
      confidence,
      model: classification.model,
      headSha: pull.headSha,
      tokensIn: classification.tokensIn,
      tokensOut: classification.tokensOut,
      costUsd: classification.costUsd,
    });

    const row = await this.deps.store.getIntentRow(prId);
    return row ? intentRowToRecord(row, pull) : undefined;
  }

  private async readDocs(
    pull: IntentPull,
    paths: readonly string[],
    log?: Logger,
  ): Promise<FetchedDoc[]> {
    const read: FetchedDoc[] = [];
    let budget = MAX_DOC_TOTAL_BYTES;

    for (const path of paths) {
      if (budget <= 0) break;
      try {
        const raw = await this.deps.docs.read(pull.repo, path);
        const content = raw.slice(0, Math.min(MAX_DOC_BYTES, budget));
        if (content.trim().length === 0) continue;
        budget -= content.length;
        read.push({ path, content });
      } catch (err) {
        log?.info({ path, err: (err as Error).message }, 'intent: doc unreadable, skipped');
      }
    }
    return read;
  }

  private async readIssues(
    pull: IntentPull,
    refs: readonly IssueReference[],
    log?: Logger,
  ): Promise<FetchedIssue[]> {
    const read: FetchedIssue[] = [];

    for (const ref of refs) {
      const repo =
        ref.owner && ref.repo ? { owner: ref.owner, name: ref.repo } : pull.repo;
      try {
        const issue = await this.deps.issues.get(repo, ref.number);
        read.push({
          ref: ref.ref,
          title: issue.title,
          state: issue.state,
          body: (issue.body ?? '').slice(0, MAX_ISSUE_BODY_CHARS),
        });
      } catch (err) {
        log?.info({ ref: ref.ref, err: (err as Error).message }, 'intent: issue unreadable, skipped');
      }
    }
    return read;
  }

  private async readLinks(
    workspaceId: string,
    refs: readonly LinkReference[],
    log?: Logger,
  ): Promise<FetchedLink[]> {
    if (refs.length === 0) return [];

    const allowlist = await this.deps.links.allowlist(workspaceId);
    if (allowlist.length === 0) {
      log?.info(
        { candidates: refs.length },
        'intent: link fetching is off — no allowlisted domains configured',
      );
      return [];
    }

    const read: FetchedLink[] = [];
    let budget = MAX_LINK_TOTAL_BYTES;

    for (const ref of refs) {
      if (budget <= 0) break;
      try {
        const page = await this.deps.links.fetch(ref.url, allowlist);
        const text = page.text.slice(0, budget);
        if (text.trim().length === 0) continue;
        budget -= text.length;
        read.push({ ...page, text });
        log?.info({ url: ref.url, bytes: text.length }, 'intent: linked page fetched');
      } catch (err) {
        log?.info({ url: ref.url, err: (err as Error).message }, 'intent: link refused or failed');
      }
    }
    return read;
  }
}
