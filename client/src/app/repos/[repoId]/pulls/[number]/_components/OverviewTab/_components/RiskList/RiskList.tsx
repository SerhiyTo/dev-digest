"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { mergeRiskToken, formatFileRef } from "@/lib/brief";
import { isExpandable, riskKey, refKey } from "./helpers";
import { s, chevronFor } from "./styles";

function RiskRefLink({
  fileRef,
  repoFullName,
  headSha,
}: {
  fileRef: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  if (repoFullName && headSha) {
    const { path, startLine, endLine } = formatFileRef(fileRef);
    return (
      <a
        className="mono"
        href={githubBlobUrl(repoFullName, headSha, path, startLine ?? undefined, endLine ?? undefined)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        style={s.refLink}
      >
        {fileRef}
      </a>
    );
  }
  return (
    <span className="mono" style={s.refPlain}>
      {fileRef}
    </span>
  );
}

function RiskRow({
  risk,
  repoFullName,
  headSha,
}: {
  risk: Risk;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const expandable = isExpandable(risk);
  const token = mergeRiskToken(risk.severity);
  const RiskIcon = Icon[token.icon];
  const firstRef = risk.file_refs[0];
  const toggle = () => setOpen((prev) => !prev);

  return (
    <div style={s.row}>
      <div
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        onClick={expandable ? toggle : undefined}
        onKeyDown={
          expandable
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
        style={s.header(expandable)}
      >
        <div style={s.headerTop}>
          <RiskIcon size={14} style={{ ...s.icon, color: token.c }} />
          <span style={s.title}>{risk.title}</span>
          {expandable && <Icon.ChevronDown size={13} style={chevronFor(open)} />}
        </div>
        {firstRef && (
          <div style={s.headerRef}>
            <RiskRefLink fileRef={firstRef} repoFullName={repoFullName} headSha={headSha} />
          </div>
        )}
      </div>

      {expandable && open && (
        <div style={s.body}>
          {risk.explanation.trim().length > 0 && <p style={s.explanation}>{risk.explanation}</p>}
          <div style={s.refs}>
            {risk.file_refs.map((fileRef, index) => (
              <RiskRefLink
                key={refKey(fileRef, index)}
                fileRef={fileRef}
                repoFullName={repoFullName}
                headSha={headSha}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RiskList({
  risks,
  repoFullName,
  headSha,
}: {
  risks: Risk[];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("brief");

  if (risks.length === 0) {
    return <div style={s.empty}>{t("noRisks")}</div>;
  }

  return (
    <div style={s.list}>
      {risks.map((risk, index) => (
        <RiskRow key={riskKey(risk, index)} risk={risk} repoFullName={repoFullName} headSha={headSha} />
      ))}
    </div>
  );
}
