"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, MonoLink, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusRow } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

interface ReviewFocusCardProps {
  rows: ReviewFocusRow[];
  repoFullName?: string | null;
  headSha?: string | null;
}

function formatFocusRange(row: ReviewFocusRow): string {
  return row.start_line === row.end_line
    ? `${row.file}:${row.start_line}`
    : `${row.file}:${row.start_line}-${row.end_line}`;
}

function FocusRowItem({
  row,
  repoFullName,
  headSha,
}: {
  row: ReviewFocusRow;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const label = formatFocusRange(row);

  return (
    <li style={s.row}>
      {repoFullName && headSha ? (
        <MonoLink href={githubBlobUrl(repoFullName, headSha, row.file, row.start_line, row.end_line)}>
          {label}
        </MonoLink>
      ) : (
        <span className="mono" style={s.ref}>
          {label}
        </span>
      )}
      <span style={s.reason}>{row.reason}</span>
    </li>
  );
}

export function ReviewFocusCard({ rows, repoFullName, headSha }: ReviewFocusCardProps) {
  const t = useTranslations("brief.reviewFocus");

  return (
    <section style={s.card}>
      <SectionLabel icon="ListChecks" right={<Badge>{rows.length}</Badge>}>
        {t("title")}
      </SectionLabel>

      {rows.length === 0 && <div style={s.empty}>{t("empty")}</div>}

      {rows.length > 0 && (
        <ul style={s.list}>
          {rows.map((row) => (
            <FocusRowItem
              key={`${row.file}:${row.start_line}-${row.end_line}`}
              row={row}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
