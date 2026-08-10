"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, MonoLink, ProgressBar, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionEvidence } from "@devdigest/shared";
import { s } from "./styles";

export function ConventionCard({
  convention,
  onAction,
  onEdit,
  busy,
}: {
  convention: ConventionCandidate;
  onAction: (action: "accept" | "reject") => void;
  onEdit: (rule: string) => void;
  busy: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(convention.rule);

  const accepted = convention.status === "accepted";
  const rejected = convention.status === "rejected";

  const startEdit = () => {
    setDraft(convention.rule);
    setEditing(true);
  };

  const save = () => {
    setEditing(false);
    if (draft.trim() !== convention.rule) onEdit(draft.trim());
  };

  return (
    <div style={s.card(accepted, rejected)}>
      <div style={s.main}>
        {editing ? (
          <div style={s.editWrap}>
            <Textarea value={draft} onChange={setDraft} rows={3} />
            <div style={s.editActions}>
              <Button kind="primary" size="sm" icon="Check" onClick={save}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={s.ruleRow}>
            <span style={s.rule(rejected)}>{convention.rule}</span>
            <IconBtn icon="Edit" label={t("card.edit")} size={26} onClick={startEdit} />
          </div>
        )}

        {convention.evidence.map((entry, index) => (
          <EvidenceBlock
            key={`${entry.path}:${entry.start_line}:${index}`}
            entry={entry}
            lead={index === 0 ? null : t("card.alsoIn")}
            copyLabel={t("card.copy")}
          />
        ))}

        <div style={s.footRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.barSlot}>
            <ProgressBar
              value={convention.confidence * 100}
              color={barColor(convention.confidence)}
            />
          </div>
          <span style={s.confidenceValue}>{`${Math.round(convention.confidence * 100)}%`}</span>
          {convention.occurrence_files != null && (
            <span style={s.occurrences}>
              {t("card.occurrences", { count: convention.occurrence_files })}
            </span>
          )}
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          active={accepted}
          disabled={busy}
          onClick={() => onAction("accept")}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind="ghost"
          icon="X"
          active={rejected}
          disabled={busy}
          onClick={() => onAction("reject")}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
      </div>
    </div>
  );
}

function EvidenceBlock({
  entry,
  lead,
  copyLabel,
}: {
  entry: ConventionEvidence;
  lead: string | null;
  copyLabel: string;
}) {
  const copy = () => {
    void navigator.clipboard?.writeText(entry.snippet);
  };

  return (
    <div style={s.evidence}>
      {lead && <div style={s.evidenceLead}>{lead}</div>}
      <div style={s.codeBlock}>
        <div style={s.codeHeader}>
          <MonoLink>{`${entry.path}:${lineLabel(entry)}`}</MonoLink>
          <div style={s.copySlot}>
            <IconBtn icon="Copy" label={copyLabel} size={26} onClick={copy} />
          </div>
        </div>
        <pre style={s.code}>{entry.snippet}</pre>
      </div>
    </div>
  );
}

function lineLabel(entry: ConventionEvidence): string {
  return entry.start_line === entry.end_line
    ? String(entry.start_line)
    : `${entry.start_line}-${entry.end_line}`;
}

function barColor(confidence: number): string {
  if (confidence >= 0.8) return "var(--ok)";
  if (confidence >= 0.6) return "var(--warn)";
  return "var(--crit)";
}
