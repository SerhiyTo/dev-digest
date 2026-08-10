"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type FileCardTarget } from "@/components/diff-viewer";
import { usePrSmartDiff } from "@/lib/hooks/smart-diff";
import {
  ROLE_ORDER,
  SCROLL_TO_TARGET_STEP_MS,
  SCROLL_TO_TARGET_TRIES,
  USER_SCROLL_EVENTS,
} from "./constants";
import { filesByPath, findingsByFile, latestReviewFindings } from "./helpers";
import { SmartDiffGroup } from "./SmartDiffGroup";
import { s } from "./styles";

export function SmartDiffViewer({
  prId,
  files,
  findings,
  commenting,
  onFindingOpen,
}: {
  prId: string | null;
  files: PrFile[];
  findings: FindingRecord[];
  commenting?: DiffCommentApi;
  onFindingOpen?: (findingId: string) => void;
}) {
  const t = useTranslations("prReview");
  const { data, isError } = usePrSmartDiff(prId);
  const [target, setTarget] = React.useState<FileCardTarget | null>(null);

  const onTarget = React.useCallback((path: string, line: number) => {
    setTarget((prev) => ({ path, line, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const patchByPath = React.useMemo(() => filesByPath(files), [files]);
  const scoped = React.useMemo(() => latestReviewFindings(findings), [findings]);
  const findingsByPath = React.useMemo(() => findingsByFile(scoped), [scoped]);

  React.useEffect(() => {
    if (!target) return;

    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      stopped = true;
    };

    const jump = () => {
      if (stopped) return;
      const el =
        document.querySelector(`[data-diff-line="${target.path}:${target.line}"]`) ??
        document.querySelector(`[data-diff-file="${target.path}"]`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        const { top, bottom } = el.getBoundingClientRect();
        if (top >= 0 && bottom <= window.innerHeight) return;
      }
      if (++tries < SCROLL_TO_TARGET_TRIES) timer = setTimeout(jump, SCROLL_TO_TARGET_STEP_MS);
    };

    const frame = requestAnimationFrame(jump);
    for (const ev of USER_SCROLL_EVENTS) window.addEventListener(ev, stop, { passive: true });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      for (const ev of USER_SCROLL_EVENTS) window.removeEventListener(ev, stop);
    };
  }, [target]);

  if (isError) {
    return (
      <>
        <div style={s.unavailable}>{t("smartDiff.unavailable")}</div>
        <DiffViewer files={files} commenting={commenting} />
      </>
    );
  }

  if (!data) return <DiffViewer files={files} commenting={commenting} />;

  const groups = ROLE_ORDER.map((role) => data.groups.find((g) => g.role === role)).filter(
    (group): group is NonNullable<typeof group> => group != null && group.files.length > 0,
  );

  const additions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const deletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
  const fileCount = groups.reduce((sum, g) => sum + g.files.length, 0);

  if (fileCount === 0) return <div style={s.unavailable}>{t("smartDiff.empty")}</div>;

  return (
    <div style={s.wrap}>
      <span style={s.summary} title={t("smartDiff.groupedByRole")}>
        {t("smartDiff.sectionLabel")} ·{" "}
        {t("smartDiff.summary", { files: fileCount, additions, deletions })}
      </span>

      {data.split_suggestion.too_big && (
        <div style={s.splitBanner}>
          <span style={s.splitTitle}>
            {t("smartDiff.largeTitle", { lines: data.split_suggestion.total_lines })}
          </span>
          <span style={s.splitBody}>{t("smartDiff.largeBody")}</span>
          {data.split_suggestion.proposed_splits.length > 0 && (
            <ul style={s.splitList}>
              {data.split_suggestion.proposed_splits.map((split) => (
                <li key={split.name}>
                  {split.name} · {t("smartDiff.filesCount", { count: split.files.length })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {scoped.length > 0 && <span style={s.caption}>{t("smartDiff.latestReviewOnly")}</span>}

      {groups.map((group) => (
        <SmartDiffGroup
          key={group.role}
          role={group.role}
          files={group.files}
          patchByPath={patchByPath}
          findingsByPath={findingsByPath}
          commenting={commenting}
          target={target}
          onTarget={onTarget}
          onFindingOpen={onFindingOpen}
        />
      ))}
    </div>
  );
}
