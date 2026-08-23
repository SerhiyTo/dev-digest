"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ChangedSymbol, DownstreamImpact } from "@devdigest/shared";
import { BlastSymbolRow } from "../BlastSymbolRow";
import { s } from "./styles";

export function BlastSymbolList({
  changedSymbols,
  downstream,
  repoFullName,
  headSha,
}: {
  changedSymbols: ChangedSymbol[];
  downstream: DownstreamImpact[];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");

  const bySymbolName = new Map<string, ChangedSymbol>();
  for (const symbol of changedSymbols) {
    if (!bySymbolName.has(symbol.name)) bySymbolName.set(symbol.name, symbol);
  }

  return (
    <div role="list" aria-label={t("symbols.ariaLabel")} style={s.list}>
      {downstream.map((item, index) => {
        const meta = bySymbolName.get(item.symbol);
        return (
          <BlastSymbolRow
            key={`${item.symbol}:${index}`}
            name={item.symbol}
            file={meta?.file ?? ""}
            kind={meta?.kind ?? null}
            callers={item.callers}
            endpoints={item.endpoints_affected}
            crons={item.crons_affected}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        );
      })}
    </div>
  );
}
