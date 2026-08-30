import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    marginBottom: 12,
  } satisfies CSSProperties,
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 14px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  chevron: (expanded: boolean): CSSProperties => ({
    transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
    transition: "transform .12s",
    color: "var(--text-muted)",
    flexShrink: 0,
  }),
  body: {
    padding: "0 14px 14px",
  } satisfies CSSProperties,
} as const;
