"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useProjectDoc } from "@/lib/hooks/context";
import { PREVIEW_URL_SCHEMES } from "../../constants";
import { REASON_KEY_BY_CODE } from "./constants";
import { s } from "./styles";

export function DocumentPreview({
  repoId,
  path,
}: {
  repoId: string;
  path: string | null;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error, refetch } = useProjectDoc(repoId, path);

  if (!path) {
    return (
      <div style={s.panel}>
        <EmptyState
          icon="FileText"
          title={t("preview.placeholderTitle")}
          body={t("preview.placeholderBody")}
        />
      </div>
    );
  }

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.path}>{path}</span>
      </div>
      <div style={s.body}>
        {isLoading && <Skeleton height={180} />}
        {!isLoading && isError && (
          <ErrorState
            title={t("preview.unreadableTitle", { path })}
            body={unreadableReason(error)}
            onRetry={() => void refetch()}
          />
        )}
        {!isLoading && !isError && (
          <>
            {data?.truncated === true && (
              <p style={s.truncated}>{t("preview.truncated")}</p>
            )}
            <Markdown allowedUrlSchemes={PREVIEW_URL_SCHEMES}>{data?.content}</Markdown>
          </>
        )}
      </div>
    </div>
  );

  function unreadableReason(err: unknown): string {
    if (!(err instanceof ApiError)) return t("preview.reasonUnknown");
    const key = err.code === undefined ? undefined : REASON_KEY_BY_CODE[err.code];
    if (key !== undefined) return t(key);
    return err.message || t("preview.reasonUnknown");
  }
}
