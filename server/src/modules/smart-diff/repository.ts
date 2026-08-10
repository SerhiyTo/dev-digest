import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { KNOWN_SEVERITIES } from './constants.js';
import type {
  LatestReviewFindings,
  ReviewKind,
  SmartDiffFileRow,
  SmartDiffFindingRow,
  SmartDiffStore,
} from './ports.js';

const KNOWN_SEVERITY_SET: ReadonlySet<string> = new Set(KNOWN_SEVERITIES);

export class SmartDiffRepository implements SmartDiffStore {
  constructor(private db: Db) {}

  async getPullSummary(workspaceId: string, prId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getFiles(prId: string): Promise<SmartDiffFileRow[]> {
    const rows = await this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));

    return rows.map((row) => ({
      path: row.path,
      additions: row.additions ?? 0,
      deletions: row.deletions ?? 0,
    }));
  }

  async getLatestReviewFindings(prId: string): Promise<LatestReviewFindings> {
    const [reviewRow] = await this.db
      .select({ id: t.reviews.id, kind: t.reviews.kind })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);

    const [fallbackRow] = reviewRow
      ? []
      : await this.db
          .select({ id: t.reviews.id, kind: t.reviews.kind })
          .from(t.reviews)
          .where(eq(t.reviews.prId, prId))
          .orderBy(desc(t.reviews.createdAt))
          .limit(1);

    const latest = reviewRow ?? fallbackRow;
    if (!latest) {
      return {
        reviewId: null,
        kind: null,
        fellBackToSummary: false,
        findings: [],
        droppedSeverities: [],
      };
    }

    const rows = await this.db
      .select({
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        severity: t.findings.severity,
      })
      .from(t.findings)
      .where(and(eq(t.findings.reviewId, latest.id), isNull(t.findings.dismissedAt)));

    const findings: SmartDiffFindingRow[] = [];
    const dropped = new Map<string, number>();
    for (const row of rows) {
      if (KNOWN_SEVERITY_SET.has(row.severity)) findings.push(row);
      else dropped.set(row.severity, (dropped.get(row.severity) ?? 0) + 1);
    }

    return {
      reviewId: latest.id,
      kind: latest.kind as ReviewKind,
      fellBackToSummary: !reviewRow,
      findings,
      droppedSeverities: [...dropped.entries()].map(([severity, count]) => ({ severity, count })),
    };
  }
}
