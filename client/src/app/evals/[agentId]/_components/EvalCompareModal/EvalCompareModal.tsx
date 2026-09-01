"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Modal, Button } from "@devdigest/ui";
import { formatCost } from "@/lib/cost";
import { relativeTime } from "@/lib/time";
import {
  diffMetric,
  isSameAgentVersion,
  orderRunsByAge,
  promptDiffState,
  type EvalCompareRunInput,
} from "./helpers";
import { s } from "./styles";

export type { EvalCompareRunInput } from "./helpers";

export interface EvalCompareModalProps {
  runA: EvalCompareRunInput;
  runB: EvalCompareRunInput;
  promptDiff: string | null;
  onClose: () => void;
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatPercentDiff(value: number | null): string {
  if (value == null) return "—";
  const points = Math.round(value * 100);
  if (points === 0) return "±0 pts";
  return points > 0 ? `+${points} pts` : `${points} pts`;
}

function formatCostDiff(value: number | null): string {
  if (value == null) return "—";
  if (value === 0) return formatCost(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatCost(Math.abs(value))}`;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function useModalFocusTrap(onClose: () => void) {
  useEffect(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (dialog) focusableElements(dialog)[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = focusableElements(dialog);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);
}

export function EvalCompareModal({ runA, runB, promptDiff, onClose }: EvalCompareModalProps) {
  const t = useTranslations("eval");
  useModalFocusTrap(onClose);

  const { older, newer } = orderRunsByAge(runA, runB);
  const sameVersion = isSameAgentVersion(older, newer);
  const promptState = promptDiffState(promptDiff, sameVersion);

  const rows = [
    {
      label: t("dashboard.metrics.recall"),
      diff: diffMetric(older.recall, newer.recall),
      format: formatPercent,
      formatDiff: formatPercentDiff,
    },
    {
      label: t("dashboard.metrics.precision"),
      diff: diffMetric(older.precision, newer.precision),
      format: formatPercent,
      formatDiff: formatPercentDiff,
    },
    {
      label: t("dashboard.metrics.citationAccuracy"),
      diff: diffMetric(older.citationAccuracy, newer.citationAccuracy),
      format: formatPercent,
      formatDiff: formatPercentDiff,
    },
    {
      label: t("dashboard.table.cost"),
      diff: diffMetric(older.costUsd, newer.costUsd),
      format: formatCost,
      formatDiff: formatCostDiff,
    },
  ];

  return (
    <Modal
      title={t("compareModal.title")}
      onClose={onClose}
      width={640}
      footer={
        <Button kind="tertiary" size="sm" onClick={onClose}>
          {t("compareModal.close")}
        </Button>
      }
    >
      <div style={s.wrap}>
        <div style={s.headerRow}>
          <div style={s.runHeader}>
            <span style={s.runLabel}>{t("compareModal.older")}</span>
            <span style={s.runMeta}>{t("dashboard.agentVersion", { version: older.agentVersion })}</span>
            <span style={s.runMeta}>{relativeTime(older.ranAt)}</span>
          </div>
          <div style={s.runHeader}>
            <span style={s.runLabel}>{t("compareModal.newer")}</span>
            <span style={s.runMeta}>{t("dashboard.agentVersion", { version: newer.agentVersion })}</span>
            <span style={s.runMeta}>{relativeTime(newer.ranAt)}</span>
          </div>
        </div>

        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th} />
              <th style={s.th}>{t("compareModal.older")}</th>
              <th style={s.th}>{t("compareModal.newer")}</th>
              <th style={s.th}>{t("compareModal.difference")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td style={s.tdLabel}>{row.label}</td>
                <td style={s.td}>{row.format(row.diff.older)}</td>
                <td style={s.td}>{row.format(row.diff.newer)}</td>
                <td style={s.td}>{row.formatDiff(row.diff.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={s.promptSection}>
          <h3 style={s.promptTitle}>{t("compareModal.promptDiffTitle")}</h3>
          {promptState === "unavailable" && (
            <p style={s.promptMessage}>{t("compareModal.promptDiffUnavailable")}</p>
          )}
          {promptState === "same_version" && (
            <p style={s.promptMessage}>{t("compareModal.sameVersion")}</p>
          )}
          {promptState === "unchanged" && (
            <p style={s.promptMessage}>{t("compareModal.promptDiffUnchanged")}</p>
          )}
          {promptState === "patch" && <pre style={s.promptText}>{promptDiff}</pre>}
        </div>
      </div>
    </Modal>
  );
}
