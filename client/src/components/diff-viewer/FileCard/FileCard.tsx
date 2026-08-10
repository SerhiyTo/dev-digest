/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { parseSeverity, severityRank } from "@/lib/severity";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES, FINDING_LINE_SPAN_CAP } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export interface FileCardTarget {
  path: string;
  line: number;
  nonce: number;
}

export function FileCard({
  file,
  commenting,
  defaultOpen,
  findings,
  target,
  onFindingsClick,
  onFindingOpen,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  defaultOpen?: boolean;
  findings?: FindingRecord[];
  target?: FileCardTarget | null;
  onFindingsClick?: () => void;
  onFindingOpen?: (findingId: string) => void;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const targetPath = target?.path;
  const targetNonce = target?.nonce;
  React.useEffect(() => {
    if (targetPath === file.path) setOpen(true);
  }, [targetPath, targetNonce, file.path]);

  // Worst finding per new-side line: it supplies both the pill colour and the
  // id the pill links to, so the reviewer lands on the finding they clicked.
  const findingByLine = React.useMemo(() => {
    const map = new Map<number, { severity: Severity; id: string }>();
    for (const f of findings ?? []) {
      const severity = parseSeverity(f.severity);
      if (!severity) continue;
      const from = Math.min(f.start_line, f.end_line);
      const to = Math.max(f.start_line, f.end_line);
      if (!Number.isFinite(from) || from < 1) continue;
      for (let line = from; line <= Math.min(to, from + FINDING_LINE_SPAN_CAP); line += 1) {
        const current = map.get(line);
        if (!current || severityRank(severity) < severityRank(current.severity)) {
          map.set(line, { severity, id: f.id });
        }
      }
    }
    return map;
  }, [findings]);

  const findingCount = findings?.length ?? 0;

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard} data-diff-file={file.path}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {findingCount > 0 && (
          <span style={s.fileFindings}>
            {onFindingsClick ? (
              <button
                type="button"
                style={s.findingsButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onFindingsClick();
                }}
              >
                <Badge dot color="var(--crit)" bg="var(--crit-bg)">
                  {t("diffViewer.findingsBadge", { count: findingCount })}
                </Badge>
              </button>
            ) : (
              <Badge dot color="var(--crit)" bg="var(--crit-bg)">
                {t("diffViewer.findingsBadge", { count: findingCount })}
              </Badge>
            )}
          </span>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const hit = ln.newNo != null ? findingByLine.get(ln.newNo) ?? null : null;
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  severity={hit?.severity ?? null}
                  anchor={ln.newNo != null ? `${file.path}:${ln.newNo}` : null}
                  onSeverityClick={
                    hit && onFindingOpen ? () => onFindingOpen(hit.id) : undefined
                  }
                />
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
