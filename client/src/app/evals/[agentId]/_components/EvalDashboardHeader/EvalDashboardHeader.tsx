"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { EVAL_RANGE_OPTIONS, rangeLabelKey, type EvalRangeDays } from "../../helpers";
import { s } from "./styles";

export interface EvalDashboardHeaderProps {
  agent: Agent;
  agents: Agent[];
  runCount: number;
  caseCount: number;
  range: EvalRangeDays;
  onRangeChange: (range: EvalRangeDays) => void;
  onSelectAgent: (agentId: string) => void;
  onRunEval: () => void;
  runActive: boolean;
  startPending: boolean;
}

export function EvalDashboardHeader({
  agent,
  agents,
  runCount,
  caseCount,
  range,
  onRangeChange,
  onSelectAgent,
  onRunEval,
  runActive,
  startPending,
}: EvalDashboardHeaderProps) {
  const t = useTranslations("eval.dashboardPage");
  const tDashboard = useTranslations("eval.dashboard");

  return (
    <div style={s.container}>
      <div style={s.titleBlock}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{agent.name}</h1>
          <Badge mono>{agent.model}</Badge>
        </div>
        <div style={s.subtitleRow}>
          <p style={s.subtitle}>{t("subtitle", { runs: runCount, cases: caseCount })}</p>
          <Link href={`/agents/${agent.id}?tab=evals`} style={s.casesLink}>
            {tDashboard("configure")}
          </Link>
        </div>
      </div>

      <div style={s.controls}>
        <Dropdown
          align="right"
          trigger={
            <Button kind="secondary" size="sm" icon="Cpu" iconRight="ChevronDown" title={t("agentPickerLabel")}>
              {agent.name}
            </Button>
          }
          items={agents.map((option) => ({
            label: option.name,
            icon: "Cpu" as const,
            onClick: () => onSelectAgent(option.id),
          }))}
        />
        <Dropdown
          align="right"
          width={160}
          trigger={
            <Button kind="secondary" size="sm" icon="Calendar" iconRight="ChevronDown" title={t("rangeLabel")}>
              {t(`range.${rangeLabelKey(range)}`)}
            </Button>
          }
          items={EVAL_RANGE_OPTIONS.map((option) => ({
            label: t(`range.${rangeLabelKey(option)}`),
            onClick: () => onRangeChange(option),
          }))}
        />
        <Button
          kind="primary"
          size="sm"
          icon="Play"
          disabled={runActive || startPending}
          loading={startPending}
          onClick={onRunEval}
        >
          {runActive ? tDashboard("running") : tDashboard("runEval", { count: caseCount })}
        </Button>
      </div>
    </div>
  );
}
