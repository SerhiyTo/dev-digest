"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrSmartDiff } from "@/lib/hooks/smart-diff";
import { ROLE_ORDER } from "./constants";
import { filesByPath, findingsByFile, liveFindings } from "./helpers";
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

  const patchByPath = React.useMemo(() => filesByPath(files), [files]);
  const live = React.useMemo(() => liveFindings(findings), [findings]);
  const findingsByPath = React.useMemo(() => findingsByFile(live), [live]);

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

      {groups.map((group) => (
        <SmartDiffGroup
          key={group.role}
          role={group.role}
          files={group.files}
          patchByPath={patchByPath}
          findingsByPath={findingsByPath}
          commenting={commenting}
          onFindingOpen={onFindingOpen}
        />
      ))}
    </div>
  );
}
