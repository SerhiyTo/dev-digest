"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agent-skills";
import {
  DISABLED_BADGE_COLOR,
  DRAG_HANDLE_ICON,
  SKELETON_ROWS,
  SKELETON_ROW_HEIGHT,
  VETTING_BADGE_COLOR,
} from "./constants";
import { matchesFilter, move, orderedLinkedIds } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);

  const DragHandle = Icon[DRAG_HANDLE_ICON];
  const { data: skills } = skillsQuery;
  const { data: links } = linksQuery;

  if (skillsQuery.isError || linksQuery.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState
          body={t("skills.loadError")}
          onRetry={() => {
            void skillsQuery.refetch();
            void linksQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (!skills || !links) {
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

  const linkedIds = orderedLinkedIds(links);
  const byId = new Map(skills.map((sk) => [sk.id, sk]));

  const linkedRows = linkedIds
    .map((id) => byId.get(id))
    .filter((sk): sk is NonNullable<typeof sk> => !!sk)
    .filter((sk) => matchesFilter(sk.name, sk.description, filter));

  const unlinkedRows = skills
    .filter((sk) => !linkedIds.includes(sk.id))
    .filter((sk) => matchesFilter(sk.name, sk.description, filter));

  const link = (id: string) => setSkills.mutate([...linkedIds, id]);
  const unlink = (id: string) => setSkills.mutate(linkedIds.filter((linkedId) => linkedId !== id));
  const reorder = (fromId: string, toId: string) => {
    const from = linkedIds.indexOf(fromId);
    const to = linkedIds.indexOf(toId);
    if (from === -1 || to === -1) return;
    setSkills.mutate(move(linkedIds, from, to));
  };

  const badgesFor = (sk: { enabled: boolean; source: string }) => (
    <div style={s.badges}>
      {!sk.enabled && (
        <span title={t("skills.disabledTitle")}>
          <Badge color={DISABLED_BADGE_COLOR}>{t("editor.disabled")}</Badge>
        </span>
      )}
      {sk.source !== "manual" && (
        <span title={tSkills("listItem.vettingTitle")}>
          <Badge color={VETTING_BADGE_COLOR}>{tSkills("listItem.needsVetting")}</Badge>
        </span>
      )}
    </div>
  );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: linkedIds.length, total: skills.length })}
        </span>
      </div>
      <div style={s.filterWrap}>
        <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} />
      </div>
      <div style={s.orderHint}>{t("skills.orderHint")}</div>

      <div style={s.section}>
        {linkedRows.map((sk) => (
          <div
            key={sk.id}
            draggable
            onDragStart={() => setDragId(sk.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) reorder(dragId, sk.id);
              setDragId(null);
            }}
            onDragEnd={() => setDragId(null)}
            style={s.row(true, sk.id === dragId)}
          >
            <DragHandle size={14} style={s.dragHandle} />
            <Checkbox checked label={sk.name} onChange={() => unlink(sk.id)} />
            {badgesFor(sk)}
          </div>
        ))}
      </div>

      {linkedRows.length > 0 && unlinkedRows.length > 0 && <div style={s.divider} />}

      <div style={s.section}>
        {unlinkedRows.map((sk) => (
          <div key={sk.id} style={s.row(false)}>
            <span style={s.dragHandleSpacer} />
            <Checkbox checked={false} label={sk.name} onChange={() => link(sk.id)} />
            {badgesFor(sk)}
          </div>
        ))}
      </div>
    </div>
  );
}
