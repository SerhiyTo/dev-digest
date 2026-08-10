"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { SkillCard } from "../_components/SkillCard";
import { SkillEditor } from "./_components/SkillEditor";
import { useSkill, useSkills, useUpdateSkill } from "../../../lib/hooks/skills";
import { ApiError } from "../../../lib/api";

const VALID_TABS = ["config", "preview", "evals", "stats", "versions"];

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;
  const t = useTranslations("skills");

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={isError ? t("detail.loadError") : t("detail.notFound.title")}
          body={
            isError
              ? error instanceof ApiError
                ? error.message
                : t("detail.loadError")
              : t("detail.notFound.body")
          }
          onRetry={isError ? () => refetch() : undefined}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        <div
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ padding: "16px 16px 12px" }}>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t("page.heading")}</h1>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
              <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
              <Badge color="var(--text-secondary)" mono>
                {t("preview.version", { version: skill.version })}
              </Badge>
              {skill.source !== "manual" && (
                <span title={t("listItem.vettingTitle")}>
                  <Badge color="var(--warn)">{t("listItem.needsVetting")}</Badge>
                </span>
              )}
              <div style={{ marginLeft: "auto" }}>
                <Button kind="secondary" size="sm" disabled title={t("editor.runOnEvalsDisabled")}>
                  {t("editor.runOnEvals")}
                </Button>
              </div>
            </div>
            <SkillEditor skill={skill} tab={tab} onTab={setTab} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
