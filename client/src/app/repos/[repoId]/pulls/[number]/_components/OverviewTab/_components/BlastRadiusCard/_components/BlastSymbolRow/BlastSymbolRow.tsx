"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { BlastCaller } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { basename, callerLabelKind } from "../../helpers";
import { BlastImpactBadges } from "../BlastImpactBadges";
import { s, chevronFor } from "./styles";

const FUNCTION_LIKE_KINDS = new Set(["function", "method"]);

export function BlastSymbolRow({
  name,
  file,
  kind,
  callers,
  endpoints,
  crons,
  repoFullName,
  headSha,
}: {
  name: string;
  file: string;
  kind: string | null;
  callers: BlastCaller[];
  endpoints: string[];
  crons: string[];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  const interactive = callers.length > 0;
  const label = kind != null && FUNCTION_LIKE_KINDS.has(kind) ? `${name}()` : name;
  const labelKind = callerLabelKind(callers);

  return (
    <div style={s.row}>
      <div
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? open : undefined}
        aria-label={interactive ? t("symbols.toggle", { name }) : undefined}
        onClick={interactive ? () => setOpen((o) => !o) : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((o) => !o);
                }
              }
            : undefined
        }
        style={s.header(interactive)}
      >
        <Icon.Code size={13} style={s.icon} />
        <span className="mono" style={s.name}>
          {label}
        </span>
        {file && <span style={s.file}>{basename(file)}</span>}
        <span style={s.spacer} />
        <span style={s.count}>{t(`callerCount.${labelKind}`, { count: callers.length })}</span>
        {interactive && <Icon.ChevronDown size={13} style={chevronFor(open)} />}
      </div>

      {interactive && open && (
        <div style={s.body}>
          {callers.map((caller, index) => (
            <div key={`${caller.file}:${caller.line}:${index}`} style={s.caller}>
              <Icon.CornerDownRight size={12} style={s.icon} />
              {repoFullName && headSha ? (
                <MonoLink href={githubBlobUrl(repoFullName, headSha, caller.file, caller.line)}>
                  {`${caller.file}:${caller.line}`}
                </MonoLink>
              ) : (
                <span className="mono" style={s.callerPath}>{`${caller.file}:${caller.line}`}</span>
              )}
              <span style={s.callerName}>{caller.name}</span>
              {caller.kind === "type" && (
                <Badge color="var(--text-muted)" bg="var(--bg-hover)" style={s.typeMarker}>
                  {t("symbols.typeMarker")}
                </Badge>
              )}
            </div>
          ))}
          <BlastImpactBadges endpoints={endpoints} crons={crons} />
        </div>
      )}
    </div>
  );
}
