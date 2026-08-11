import type { IntentEvidence, IntentEvidenceKind } from '@devdigest/shared';
import {
  CONVENTIONAL_PREFIX,
  DESCRIPTIVE_COMMIT_CHARS,
  DETAILED_BODY_CHARS,
  INTENT_EVIDENCE_WEIGHTS,
  MIN_DESCRIPTIVE_COMMITS,
} from './constants.js';
import type {
  DocReference,
  ExternalReference,
  IssueReference,
  LinkReference,
} from './references.js';

export interface IntentSignals {
  title: string;
  body: string | null;
  branch: string;
  changedPaths: readonly string[];
  commitMessages: readonly string[];
  docReferences: readonly DocReference[];
  docsRead: readonly string[];
  issueReferences?: readonly IssueReference[];
  issuesRead?: readonly string[];
  linkReferences?: readonly LinkReference[];
  linksRead?: readonly string[];
  externalReferences: readonly ExternalReference[];
}

function evidence(kind: IntentEvidenceKind, detail: string): IntentEvidence {
  return { kind, detail, weight: INTENT_EVIDENCE_WEIGHTS[kind] };
}

function countDescriptiveCommits(messages: readonly string[]): number {
  return messages.filter((m) => (m.split('\n')[0] ?? '').trim().length > DESCRIPTIVE_COMMIT_CHARS)
    .length;
}

export function gatherEvidence(signals: IntentSignals): IntentEvidence[] {
  const found: IntentEvidence[] = [];
  const body = signals.body?.trim() ?? '';

  if (body.length > 0) {
    found.push(evidence('pr_body', `PR description present (${body.length} chars)`));
  }
  if (body.length >= DETAILED_BODY_CHARS) {
    found.push(evidence('pr_body_detailed', `Description is detailed (>= ${DETAILED_BODY_CHARS} chars)`));
  }

  if (signals.docsRead.length > 0) {
    found.push(
      evidence('doc_reference_read', `Read referenced document(s): ${signals.docsRead.join(', ')}`),
    );
  } else if (signals.docReferences.length > 0) {
    found.push(
      evidence(
        'doc_reference_unresolved',
        `Referenced but unreadable: ${signals.docReferences.map((d) => d.path).join(', ')}`,
      ),
    );
  }

  const descriptive = countDescriptiveCommits(signals.commitMessages);
  if (descriptive >= MIN_DESCRIPTIVE_COMMITS) {
    found.push(evidence('commit_messages', `${descriptive} descriptive commit message(s)`));
  }

  if (CONVENTIONAL_PREFIX.test(signals.title) || CONVENTIONAL_PREFIX.test(signals.branch)) {
    found.push(evidence('conventional_prefix', 'Conventional prefix on the title or branch'));
  }

  const issuesRead = signals.issuesRead ?? [];
  const trackedRefs = signals.externalReferences.filter((r) => r.kind !== 'url');
  if (issuesRead.length > 0) {
    found.push(evidence('issue_read', `Read linked issue(s): ${issuesRead.join(', ')}`));
  } else if (trackedRefs.length > 0) {
    found.push(
      evidence(
        'issue_reference',
        `Ticket referenced but not fetched: ${trackedRefs.map((r) => r.ref).join(', ')}`,
      ),
    );
  }

  const linksRead = signals.linksRead ?? [];
  const linkRefs = signals.externalReferences.filter((r) => r.kind === 'url');
  if (linksRead.length > 0) {
    found.push(evidence('external_link_read', `Read linked page(s): ${linksRead.join(', ')}`));
  } else if (linkRefs.length > 0) {
    found.push(evidence('external_link', `${linkRefs.length} external link(s), not fetched`));
  }

  if (signals.changedPaths.length > 0) {
    found.push(evidence('changed_paths', `${signals.changedPaths.length} changed file path(s)`));
  }

  return found;
}

export function scoreConfidence(evidenceItems: readonly IntentEvidence[]): number {
  const total = evidenceItems.reduce((sum, e) => sum + e.weight, 0);
  return Math.round(Math.min(Math.max(total, 0), 1) * 100) / 100;
}
