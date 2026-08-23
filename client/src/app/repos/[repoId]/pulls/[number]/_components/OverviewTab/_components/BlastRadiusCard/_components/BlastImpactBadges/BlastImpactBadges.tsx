"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { METHOD_TOKEN, METHOD_FALLBACK, CRON_TOKEN } from "../../constants";
import { parseEndpoint, formatCron } from "../../helpers";
import { s } from "./styles";

export function BlastImpactBadges({
  endpoints,
  crons,
}: {
  endpoints: string[];
  crons: string[];
}) {
  const t = useTranslations("blast");

  if (endpoints.length === 0 && crons.length === 0) {
    return <div style={s.none}>{t("impact.none")}</div>;
  }

  return (
    <div style={s.wrap}>
      {endpoints.length > 0 && (
        <div style={s.group} aria-label={t("impact.endpoints")}>
          {endpoints.map((endpoint) => {
            const { method, path } = parseEndpoint(endpoint);
            const token = method ? METHOD_TOKEN[method] ?? METHOD_FALLBACK : METHOD_FALLBACK;
            return (
              <Badge key={endpoint} icon="Globe" color={token.c} bg={token.bg} mono>
                {method ? `${method} ${path}` : path}
              </Badge>
            );
          })}
        </div>
      )}
      {crons.length > 0 && (
        <div style={s.group} aria-label={t("impact.crons")}>
          {crons.map((cron) => (
            <Badge key={cron} icon="Clock" color={CRON_TOKEN.c} bg={CRON_TOKEN.bg} mono>
              {formatCron(cron)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
