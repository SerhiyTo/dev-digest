import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { KNOWN_SEVERITIES } from './constants.js';
import type {
  PrFindings,
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

  async getFindings(prId: string): Promise<PrFindings> {
    const rows = await this.db
      .select({
        reviewId: t.findings.reviewId,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        severity: t.findings.severity,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.prId, prId), isNull(t.findings.dismissedAt)));

    const findings: SmartDiffFindingRow[] = [];
    const dropped = new Map<string, number>();
    const reviewIds = new Set<string>();
    for (const row of rows) {
      reviewIds.add(row.reviewId);
      const finding = {
        file: row.file,
        startLine: row.startLine,
        endLine: row.endLine,
        severity: row.severity,
      };
      if (KNOWN_SEVERITY_SET.has(row.severity)) findings.push(finding);
      else dropped.set(row.severity, (dropped.get(row.severity) ?? 0) + 1);
    }

    return {
      findings,
      reviewCount: reviewIds.size,
      droppedSeverities: [...dropped.entries()].map(([severity, count]) => ({ severity, count })),
    };
  }
}
