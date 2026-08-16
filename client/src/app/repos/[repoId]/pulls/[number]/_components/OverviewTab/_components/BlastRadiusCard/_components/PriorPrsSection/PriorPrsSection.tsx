"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { PrHistoryItem } from "@devdigest/shared";
import { relativeTime } from "@/lib/time";
import { PR_STATUS_NOTES } from "../../constants";
import { s, chevronFor } from "./styles";

function statusKey(notes: string): string {
  return PR_STATUS_NOTES.has(notes) ? notes : "unknown";
}

export function PriorPrsSection({ history }: { history: PrHistoryItem[] }) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);

  return (
    <div style={s.section}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={t("history.toggle")}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={s.header}
      >
        <Icon.History size={13} style={s.icon} />
        <span style={s.title}>{t("history.title")}</span>
        <Badge mono>{history.length}</Badge>
        <span style={s.spacer} />
        <Icon.ChevronDown size={13} style={chevronFor(open)} />
      </div>

      {open && (
        <div style={s.body}>
          {history.length === 0 ? (
            <div style={s.empty}>{t("history.empty")}</div>
          ) : (
            history.map((item) => (
              <div key={item.pr_number} style={s.row}>
                <span className="mono" style={s.number}>{`#${item.pr_number}`}</span>
                <span style={s.itemTitle}>{item.title}</span>
                <span style={s.author}>{item.author}</span>
                <span style={s.time}>{relativeTime(item.merged_at)}</span>
                <Badge>{t(`history.status.${statusKey(item.notes)}`)}</Badge>
                <span title={item.files_overlap.join("\n")} style={s.overlap}>
                  {t("history.overlap", { count: item.files_overlap.length })}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
