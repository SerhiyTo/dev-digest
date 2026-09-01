"use client";

import { useTranslations } from "next-intl";
import type { EvalCaseRecord } from "@devdigest/shared";
import { Badge, Button, Icon, type IconName } from "@devdigest/ui";
import { caseStatus, expectationChip, passingTally, type EvalCaseStatus } from "./helpers";
import { s } from "./styles";

export interface EvalCaseListProps {
  cases: EvalCaseRecord[];
  gotFindingCountByCase?: Map<string, number>;
  loading?: boolean;
  runningCaseId?: string | null;
  onCreate: () => void;
  onRun: (caseId: string) => void;
  onEdit: (caseId: string) => void;
  onDelete: (caseId: string) => void;
}

const STATUS_PRESENTATION: Record<EvalCaseStatus, { icon: IconName; color: string }> = {
  passed: { icon: "CheckCircle", color: "var(--ok)" },
  failed: { icon: "XCircle", color: "var(--crit)" },
  never: { icon: "Dot", color: "var(--text-muted)" },
};

export function EvalCaseList({
  cases,
  gotFindingCountByCase,
  loading = false,
  runningCaseId = null,
  onCreate,
  onRun,
  onEdit,
  onDelete,
}: EvalCaseListProps) {
  const t = useTranslations("eval.evalsTab");
  const tally = passingTally(cases);

  return (
    <div style={s.container}>
      <div style={s.headerRow}>
        <h3 style={s.heading}>{t("casesHeading")}</h3>
        {cases.length > 0 && (
          <Badge color="var(--ok)" bg="var(--ok-bg)">
            {t("passingBadge", { passed: tally.passed, total: tally.total })}
          </Badge>
        )}
        <div style={s.headerSpacer} />
        <Button kind="primary" size="sm" icon="Plus" onClick={onCreate}>
          {t("newCase")}
        </Button>
      </div>
      {loading && <div style={s.statusText}>{t("loadingCases")}</div>}
      {!loading && cases.length === 0 && (
        <div style={s.emptyState}>
          <p style={s.emptyText}>{t("emptyCases")}</p>
          <Button kind="primary" size="sm" icon="Plus" onClick={onCreate}>
            {t("newCase")}
          </Button>
        </div>
      )}
      {!loading && cases.length > 0 && (
        <ul style={s.list}>
          {cases.map((c) => (
            <EvalCaseRow
              key={c.id}
              caseRecord={c}
              gotFindingCount={gotFindingCountByCase?.get(c.id) ?? null}
              running={runningCaseId === c.id}
              onRun={() => onRun(c.id)}
              onEdit={() => onEdit(c.id)}
              onDelete={() => onDelete(c.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EvalCaseRow({
  caseRecord,
  gotFindingCount,
  running,
  onRun,
  onEdit,
  onDelete,
}: {
  caseRecord: EvalCaseRecord;
  gotFindingCount: number | null;
  running: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval.evalsTab");
  const status = caseStatus(caseRecord);
  const presentation = STATUS_PRESENTATION[status];
  const StatusIcon = Icon[presentation.icon];
  const statusLabel =
    status === "passed" ? t("statusPassed") : status === "failed" ? t("statusFailed") : t("statusNeverRun");
  const expected = caseRecord.expected_output.length;
  const chip = expectationChip(caseRecord.expected_output);

  return (
    <li style={s.row}>
      <span style={{ ...s.statusIcon, color: presentation.color }} role="img" aria-label={statusLabel}>
        <StatusIcon size={16} />
      </span>
      <div style={s.rowMain}>
        <span className="mono" style={s.name}>
          {caseRecord.name}
        </span>
        <span style={s.expectation}>
          {gotFindingCount === null
            ? t("expectedOnly", { expected })
            : t("expectedGot", { expected, got: gotFindingCount })}
        </span>
      </div>
      <Badge color="var(--text-muted)">{chip ?? t("emptyExpectation")}</Badge>
      <div style={s.actions}>
        <Button
          kind="tertiary"
          size="sm"
          icon="Play"
          aria-label={running ? t("running") : t("run")}
          onClick={onRun}
          loading={running}
        />
        <Button kind="tertiary" size="sm" icon="Edit" aria-label={t("edit")} onClick={onEdit} />
        <Button kind="tertiary" size="sm" icon="Trash" aria-label={t("delete")} onClick={onDelete} />
      </div>
    </li>
  );
}
