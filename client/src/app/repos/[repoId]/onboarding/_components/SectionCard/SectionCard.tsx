"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function SectionCard({
  title,
  badge,
  defaultExpanded = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const contentId = React.useId();

  return (
    <section style={s.card}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={contentId}
        style={s.header}
      >
        <span style={s.title}>{title}</span>
        {badge}
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </button>
      <div id={contentId} hidden={!expanded} style={s.body}>
        {children}
      </div>
    </section>
  );
}

export default SectionCard;
