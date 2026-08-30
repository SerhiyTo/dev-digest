import type { CSSProperties } from "react";

export const s = {
  panel: {
    background: "var(--bg-surface)",
    borderTop: "1px solid var(--border)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    borderLeft: "1px solid var(--border)",
    borderRadius: 8,
    minHeight: 320,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  path: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  body: { padding: "18px 20px", fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  truncated: {
    margin: "0 0 14px",
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
