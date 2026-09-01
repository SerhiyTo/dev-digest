/* AgentEditor — agent editor shell (tab bar + tab body). Config edits the
   model/prompt; Skills wires which workspace skills this agent sees, and in
   what order; Context attaches the repository's markdown documents; Evals is
   the agent's regression set, its runs and their comparison. Stats/CI arrive
   in later lessons. Tab state lives in ?tab= via the
   `tab`/`onTab` props threaded from the page. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { SkillsTab } from "./_components/SkillsTab";
import { EvalsTab } from "../EvalsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "skills" && <SkillsTab agentId={agent.id} />}
        {tab === "evals" && <EvalsTab agentId={agent.id} />}
        {tab === "context" && <ContextTab agentId={agent.id} />}
        {tab !== "skills" && tab !== "evals" && tab !== "context" && <ConfigTab agent={agent} />}
      </div>
    </div>
  );
}
