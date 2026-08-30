"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { OnboardingSection, OnboardingSectionKind } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { formatCost } from "@/lib/cost";
import { relativeTime } from "@/lib/time";
import { ONBOARDING_SECTION_KINDS } from "@/lib/onboarding";
import { useGenerateOnboarding, useOnboarding } from "@/lib/hooks/onboarding";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ArchitectureSection } from "../ArchitectureSection";
import { CriticalPathsSection } from "../CriticalPathsSection";
import { FirstTasksSection } from "../FirstTasksSection";
import { OnThisPageRail, onboardingSectionElementId } from "../OnThisPageRail";
import { ReadingPathSection } from "../ReadingPathSection";
import { RegenerateButton } from "../RegenerateButton";
import { RunLocallySection } from "../RunLocallySection";
import { SectionCard } from "../SectionCard";
import { ShareLinkButton } from "../ShareLinkButton";
import { isStale, sectionByKind } from "./helpers";
import { s } from "./styles";

function SectionBody({
  kind,
  section,
  repoId,
}: {
  kind: OnboardingSectionKind;
  section: OnboardingSection;
  repoId: string;
}) {
  switch (kind) {
    case "architecture":
      return <ArchitectureSection section={section} />;
    case "critical_paths":
      return <CriticalPathsSection section={section} repoId={repoId} />;
    case "run_locally":
      return <RunLocallySection section={section} />;
    case "reading_path":
      return <ReadingPathSection section={section} />;
    case "first_tasks":
      return <FirstTasksSection section={section} />;
  }
}

export function OnboardingView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useOnboarding(repoId);
  const generate = useGenerateOnboarding(repoId);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.wrap}>
          <Skeleton height={140} />
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState title={t("loadError.title")} onRetry={() => void refetch()} />
      </AppShell>
    );
  }

  const tour = data.tour;
  const hasTour = tour != null;
  const running = data.status === "running";
  const failed = data.status === "failed";
  const stale = isStale(data.current_sha, data.generated_sha);
  const model = data.model;
  const generating = running || generate.isPending;

  const freshness =
    data.generated_at != null
      ? data.files_indexed != null
        ? t("freshness.withFiles", {
            time: relativeTime(data.generated_at),
            count: data.files_indexed,
          })
        : t("freshness.withoutFiles", { time: relativeTime(data.generated_at) })
      : null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.headerRow}>
          <div style={s.headerMain}>
            <h1 style={s.h1}>{t("title")}</h1>
            {freshness && <p style={s.subtitle}>{freshness}</p>}
            <div style={s.badges}>
              {stale && (
                <Badge color="var(--warn)" bg="var(--warn-bg)">
                  {t("badges.stale")}
                </Badge>
              )}
              {tour?.degraded && (
                <Badge color="var(--accent)" bg="var(--accent-bg)">
                  {t("badges.partial")}
                </Badge>
              )}
            </div>
            <div style={s.metaRow}>
              {model && <span style={s.meta}>{t("header.model", { model })}</span>}
              {data.cost_usd != null && (
                <span style={s.meta}>{t("header.cost", { cost: formatCost(data.cost_usd) })}</span>
              )}
            </div>
            {running && hasTour && <p style={s.runningNote}>{t("generate.generating")}</p>}
          </div>
          {hasTour && model && (
            <div style={s.headerActions}>
              <RegenerateButton repoId={repoId} model={model} disabled={generating} />
              <ShareLinkButton />
            </div>
          )}
        </div>

        {failed && (
          <div style={s.failureBox}>
            <p style={s.failureTitle}>{t("failure.title")}</p>
            {data.failure_reason && <p style={s.failureReason}>{data.failure_reason}</p>}
            {data.failed_cost_usd != null && (
              <p style={s.failureCost}>
                {t("failure.cost", { cost: formatCost(data.failed_cost_usd) })}
              </p>
            )}
            <Button
              kind="secondary"
              onClick={() => generate.mutate()}
              disabled={generating}
            >
              {tCommon("actions.retry")}
            </Button>
          </div>
        )}

        {!hasTour ? (
          <EmptyState
            icon="Workflow"
            title={t("generate.title")}
            body={t("generate.body")}
            cta={generating ? t("generate.generating") : t("generate.cta", { model: model ?? "" })}
            onCta={() => generate.mutate()}
            ctaLoading={generating}
          />
        ) : (
          <div style={s.body}>
            <div style={s.sections}>
              {ONBOARDING_SECTION_KINDS.map((kind) => {
                const section = sectionByKind(tour, kind);
                return (
                  <div id={onboardingSectionElementId(kind)} key={kind} style={s.sectionAnchor}>
                    <SectionCard title={t(`sections.${kind}.title`)}>
                      {section ? (
                        <SectionBody kind={kind} section={section} repoId={repoId} />
                      ) : (
                        <p style={s.empty}>{t(`sections.${kind}.empty`)}</p>
                      )}
                    </SectionCard>
                  </div>
                );
              })}
            </div>
            <OnThisPageRail />
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default OnboardingView;
