"use client";

import React from "react";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, IconBtn, Skeleton, TextInput } from "@devdigest/ui";
import {
  useDocAttachments,
  useProjectDocs,
  useSetDocAttachments,
  useTokenEstimate,
  type DocOwnerKind,
} from "@/lib/hooks/context";
import {
  DRAG_HANDLE_ICON,
  ESTIMATE_DEBOUNCE_MS,
  MAX_ATTACHMENTS,
  MISSING_BADGE_COLOR,
  MOVE_DOWN_ICON,
  MOVE_UP_ICON,
  SKELETON_ROWS,
  SKELETON_ROW_HEIGHT,
} from "./constants";
import {
  attachedRows,
  matchesFilter,
  move,
  orderedAttachedPaths,
  saveErrorText,
  unattachedDocs,
  type SaveErrorLabels,
} from "./helpers";
import { s } from "./styles";

export interface DocAttachLabels extends SaveErrorLabels {
  title: string;
  attachedCount: (attached: number, total: number, repo: string) => string;
  scopeNote: (repo: string) => string;
  repoUnknown: string;
  filterPlaceholder: string;
  orderHint: string;
  missing: string;
  missingTitle: (repo: string) => string;
  moveUp: string;
  moveDown: string;
  tokenEstimate: (tokens: number) => string;
  estimatePending: string;
  estimateUnavailable: string;
  limitReached: (max: number) => string;
  loadError: string;
  noRepo: string;
  noDocumentsTitle: string;
  noDocumentsBody: string;
}

function useDebouncedPaths(paths: readonly string[]): string[] {
  const key = paths.join("\n");
  const [settled, setSettled] = React.useState(key);

  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(key), ESTIMATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key]);

  return React.useMemo(() => (settled ? settled.split("\n") : []), [settled]);
}

export function DocAttachPanel({
  ownerKind,
  ownerId,
  repoId,
  repoName,
  labels,
}: {
  ownerKind: DocOwnerKind;
  ownerId: string;
  repoId: string | null;
  repoName: string | null;
  labels: DocAttachLabels;
}) {
  const docsQuery = useProjectDocs(repoId);
  const attachmentsQuery = useDocAttachments(ownerKind, ownerId);
  const setAttachments = useSetDocAttachments(ownerKind, ownerId);
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);

  const attachedPaths = attachmentsQuery.data
    ? orderedAttachedPaths(attachmentsQuery.data)
    : [];
  const estimatePaths = useDebouncedPaths(attachedPaths.slice(0, MAX_ATTACHMENTS));
  const estimate = useTokenEstimate(repoId, estimatePaths);

  const DragHandle = Icon[DRAG_HANDLE_ICON];
  const repoLabel = repoName ?? labels.repoUnknown;
  const saveError = saveErrorText(setAttachments.error, MAX_ATTACHMENTS, labels);

  if (!repoId) {
    return (
      <div style={s.wrap}>
        <EmptyState icon="GitBranch" title={labels.noRepo} />
      </div>
    );
  }

  if (docsQuery.isError || attachmentsQuery.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState
          body={labels.loadError}
          onRetry={() => {
            void docsQuery.refetch();
            void attachmentsQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (!docsQuery.data || !attachmentsQuery.data) {
    return (
      <div style={s.wrap}>
        <div style={s.skeletonStack}>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <Skeleton key={i} height={SKELETON_ROW_HEIGHT} />
          ))}
        </div>
      </div>
    );
  }

  const documents = docsQuery.data.documents;
  const rows = attachedRows(attachedPaths, documents).filter((row) =>
    matchesFilter(row.name, row.path, filter),
  );
  const available = unattachedDocs(documents, attachedPaths).filter((doc) =>
    matchesFilter(doc.name, doc.path, filter),
  );
  const atLimit = attachedPaths.length >= MAX_ATTACHMENTS;

  const attach = (path: string) => {
    if (atLimit) return;
    setAttachments.mutate([...attachedPaths, path]);
  };
  const detach = (path: string) =>
    setAttachments.mutate(attachedPaths.filter((attached) => attached !== path));
  const reorder = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= attachedPaths.length || to >= attachedPaths.length) return;
    setAttachments.mutate(move(attachedPaths, from, to));
  };
  const shift = (path: string, delta: number) => {
    const from = attachedPaths.indexOf(path);
    reorder(from, from + delta);
  };
  const dropOn = (path: string) => {
    if (dragPath) reorder(attachedPaths.indexOf(dragPath), attachedPaths.indexOf(path));
    setDragPath(null);
  };

  if (documents.length === 0 && attachedPaths.length === 0) {
    return (
      <div style={s.wrap}>
        <div style={s.header}>
          <h2 style={s.h2}>{labels.title}</h2>
        </div>
        <div style={s.scopeNote}>{labels.scopeNote(repoLabel)}</div>
        <EmptyState icon="FileText" title={labels.noDocumentsTitle} body={labels.noDocumentsBody} />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{labels.title}</h2>
        <span style={s.count}>
          {labels.attachedCount(attachedPaths.length, documents.length, repoLabel)}
        </span>
      </div>
      <div style={s.scopeNote}>{labels.scopeNote(repoLabel)}</div>
      {saveError !== null && (
        <div role="alert" style={s.saveError}>
          {saveError}
        </div>
      )}
      <div style={s.filterWrap}>
        <TextInput value={filter} onChange={setFilter} placeholder={labels.filterPlaceholder} />
      </div>
      <div style={s.orderHint}>{labels.orderHint}</div>

      <div style={s.section}>
        {rows.map((row) => (
          <div
            key={row.path}
            draggable
            onDragStart={() => setDragPath(row.path)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(row.path)}
            onDragEnd={() => setDragPath(null)}
            style={s.row(true, row.path === dragPath)}
          >
            <DragHandle size={14} style={s.dragHandle} />
            <span style={s.moveButtons}>
              <IconBtn
                icon={MOVE_UP_ICON}
                size={24}
                label={`${labels.moveUp}: ${row.path}`}
                onClick={() => shift(row.path, -1)}
              />
              <IconBtn
                icon={MOVE_DOWN_ICON}
                size={24}
                label={`${labels.moveDown}: ${row.path}`}
                onClick={() => shift(row.path, 1)}
              />
            </span>
            <span style={s.rowMain}>
              <Checkbox checked label={row.name} onChange={() => detach(row.path)} />
              <span style={s.rowFolder}>{row.folder}</span>
            </span>
            {row.missing && (
              <span style={s.badges} title={labels.missingTitle(repoLabel)}>
                <Badge color={MISSING_BADGE_COLOR}>{labels.missing}</Badge>
              </span>
            )}
          </div>
        ))}
      </div>

      {rows.length > 0 && available.length > 0 && <div style={s.divider} />}

      <div style={s.section}>
        {available.map((doc) => (
          <div key={doc.path} style={s.row(false)}>
            <span style={s.dragHandleSpacer} />
            <span style={s.moveButtonsSpacer} />
            <span style={s.rowMain}>
              <Checkbox checked={false} label={doc.name} onChange={() => attach(doc.path)} />
              <span style={s.rowFolder}>{doc.folder}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={s.footer} aria-live="polite">
        <span>{footerText()}</span>
        {atLimit && <span style={s.limit}>{labels.limitReached(MAX_ATTACHMENTS)}</span>}
      </div>
    </div>
  );

  function footerText(): string {
    if (estimate.isError) return labels.estimateUnavailable;
    if (!estimate.data) return labels.estimatePending;
    return labels.tokenEstimate(estimate.data.tokens);
  }
}
