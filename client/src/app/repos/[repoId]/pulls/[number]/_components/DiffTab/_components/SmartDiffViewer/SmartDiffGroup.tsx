"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord, PrFile, SmartDiffFile, SmartDiffRole } from "@devdigest/shared";
import { FileCard, type DiffCommentApi, type FileCardTarget } from "@/components/diff-viewer";
import { shouldDefaultOpen } from "./helpers";
import { s, groupDotFor } from "./styles";

const LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  wiring: "smartDiff.wiringLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

const SUBTITLE_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreSubtitle",
  wiring: "smartDiff.wiringSubtitle",
  boilerplate: "smartDiff.boilerplateSubtitle",
};

export function SmartDiffGroup({
  role,
  files,
  patchByPath,
  findingsByPath,
  commenting,
  target,
  onTarget,
  onFindingOpen,
}: {
  role: SmartDiffRole;
  files: SmartDiffFile[];
  patchByPath: Map<string, PrFile>;
  findingsByPath: Map<string, FindingRecord[]>;
  commenting?: DiffCommentApi;
  target: FileCardTarget | null;
  onTarget: (path: string, line: number) => void;
  onFindingOpen?: (findingId: string) => void;
}) {
  const t = useTranslations("prReview");

  return (
    <section style={s.group} aria-label={t(LABEL_KEY[role])}>
      <header style={s.groupHeader}>
        <span style={groupDotFor(role)} />
        <span style={s.groupLabel}>{t(LABEL_KEY[role])}</span>
        <span style={s.groupSubtitle}>{t(SUBTITLE_KEY[role])}</span>
        <span style={s.groupCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </header>
      <div style={s.files}>
        {files.map((file) => {
          const prFile = patchByPath.get(file.path);
          const findings = findingsByPath.get(file.path) ?? [];
          return (
            <FileCard
              key={file.path}
              file={
                prFile ?? {
                  path: file.path,
                  additions: file.additions,
                  deletions: file.deletions,
                  patch: null,
                }
              }
              commenting={commenting}
              findings={findings}
              target={target}
              onFindingsClick={() => onTarget(file.path, file.finding_lines[0] ?? 0)}
              onFindingOpen={onFindingOpen}
              defaultOpen={shouldDefaultOpen(
                role,
                findings.length > 0,
                (prFile?.patch ?? null) !== null,
              )}
            />
          );
        })}
      </div>
    </section>
  );
}
