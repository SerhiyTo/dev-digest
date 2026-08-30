"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useRepoFile } from "@/lib/hooks";
import { s } from "./styles";

export function FileView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const search = useSearchParams();
  const path = search.get("path");
  const { data, isLoading, isNotFound, isError, refetch } = useRepoFile(repoId, path);

  const notFound = path === null || isNotFound;

  return (
    <AppShell>
      <div style={s.wrap}>
        {isLoading && <Skeleton height={240} />}

        {!isLoading && notFound && (
          <EmptyState
            icon="File"
            title={t("fileView.notFound.title")}
            body={t("fileView.notFound.body")}
          />
        )}

        {!isLoading && !notFound && isError && (
          <ErrorState title={tCommon("states.error")} onRetry={() => void refetch()} />
        )}

        {!isLoading && !notFound && !isError && data && (
          <>
            <div style={s.header}>
              <span className="mono" style={s.path}>
                {data.path}
              </span>
            </div>
            <pre className="mono" style={s.content}>
              {data.content}
            </pre>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default FileView;
