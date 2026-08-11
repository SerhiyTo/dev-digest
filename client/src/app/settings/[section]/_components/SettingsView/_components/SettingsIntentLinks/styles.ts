import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,

  warning: {
    borderTop: "1px solid var(--warn)",
    borderRight: "1px solid var(--warn)",
    borderBottom: "1px solid var(--warn)",
    borderLeft: "3px solid var(--warn)",
    borderRadius: 8,
    background: "var(--warn-bg)",
    padding: "12px 14px",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  row: { display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,

  input: {
    flex: 1,
    background: "var(--bg-surface)",
    borderTop: "1px solid var(--border)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    borderLeft: "1px solid var(--border)",
    borderRadius: 6,
    padding: "7px 10px",
    fontSize: 13,
    color: "var(--text-primary)",
    outline: "none",
  } satisfies CSSProperties,

  list: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,

  item: { display: "inline-flex", alignItems: "center", gap: 2 } satisfies CSSProperties,

  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
