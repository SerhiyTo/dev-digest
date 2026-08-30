"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, TextInput } from "@devdigest/ui";
import type { ProjectDoc } from "@/lib/types";
import { filterDocs, groupByCategory } from "../../helpers";
import { row, s } from "./styles";

export function DocumentList({
  documents,
  selectedPath,
  onSelect,
}: {
  documents: ProjectDoc[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");

  const groups = groupByCategory(filterDocs(documents, filter));

  return (
    <div style={s.panel}>
      <TextInput value={filter} onChange={setFilter} placeholder={t("list.filterPlaceholder")} />

      {groups.length === 0 && <div style={s.noMatches}>{t("list.noMatches")}</div>}

      <div style={s.groups}>
        {groups.map((group) => (
          <div key={group.category}>
            <div style={s.groupLabel}>{group.category}</div>
            <div style={s.rows}>
              {group.documents.map((doc) => (
                <button
                  key={doc.path}
                  type="button"
                  onClick={() => onSelect(doc.path)}
                  aria-current={doc.path === selectedPath ? "true" : undefined}
                  style={row(doc.path === selectedPath)}
                >
                  <span style={s.rowMain}>
                    <span style={s.rowName}>{doc.name}</span>
                    <span style={{ display: "block", ...s.rowFolder }}>{doc.folder}</span>
                  </span>
                  {doc.used_by_agents.length > 0 && (
                    <span title={t("list.usedByTitle", { agents: doc.used_by_agents.join(", ") })}>
                      <Badge icon="Cpu" color="var(--accent-text)">
                        {t("list.usedBy", { count: doc.used_by_agents.length })}
                      </Badge>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
