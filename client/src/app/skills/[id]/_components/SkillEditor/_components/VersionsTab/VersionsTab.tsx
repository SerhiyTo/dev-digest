"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { useRestoreSkillVersion, useSkillVersionDiff, useSkillVersions } from "@/lib/hooks/skills";
import { toDiffFile } from "./helpers";
import { s } from "./styles";

function VersionDiffAgainstCurrentPanel({ skill, version }: { skill: Skill; version: number }) {
  const t = useTranslations("skills");
  const { data, isLoading } = useSkillVersionDiff(skill.id, version);

  return (
    <div style={s.diffPanel}>
      <div style={s.diffLabel}>{t("versions.compare", { from: version, to: skill.version })}</div>
      {isLoading && <Skeleton height={80} />}
      {data &&
        (data.patch === "" ? (
          <EmptyState title={t("versions.noChangesTitle")} />
        ) : (
          <DiffViewer files={[toDiffFile(skill.name, data.patch)]} />
        ))}
    </div>
  );
}

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion(skill.id);
  const [diffVersion, setDiffVersion] = React.useState<number | null>(null);

  const onRestore = (version: number) => {
    if (window.confirm(t("versions.confirmRestore", { version }))) restore.mutate(version);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.history")}</h2>
        {versions && <span style={s.count}>{t("versions.count", { count: versions.length })}</span>}
      </div>

      {isLoading && <Skeleton height={140} />}
      {isError && <ErrorState title={t("versions.loadError")} onRetry={() => refetch()} />}

      {versions && (
        <div style={s.list}>
          {versions.map((v) => {
            const current = v.version === skill.version;
            return (
              <div key={v.version} style={s.row}>
                <div style={s.rowMain}>
                  <span className="mono" style={s.versionTag}>
                    {t("preview.version", { version: v.version })}
                  </span>
                  {v.label && <span style={s.label}>{v.label}</span>}
                  <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
                  {current && <Badge color="var(--ok)">{t("versions.current")}</Badge>}
                  {!current && (
                    <div style={s.actions}>
                      <Button
                        kind="secondary"
                        size="sm"
                        onClick={() => setDiffVersion(diffVersion === v.version ? null : v.version)}
                      >
                        {t("versions.diff")}
                      </Button>
                      <Button
                        kind="secondary"
                        size="sm"
                        onClick={() => onRestore(v.version)}
                        loading={restore.isPending}
                      >
                        {t("versions.restore")}
                      </Button>
                    </div>
                  )}
                </div>
                {diffVersion === v.version && (
                  <VersionDiffAgainstCurrentPanel skill={skill} version={v.version} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
