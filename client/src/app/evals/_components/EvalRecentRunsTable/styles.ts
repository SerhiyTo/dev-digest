import type { CSSProperties } from "react";

export const s = {
  table: {
    width: "100%",
    borderCollapse: "collapse",
    borderRadius: 9,
    overflow: "hidden",
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  th: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    textAlign: "left",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: {
    fontSize: 13,
    padding: "11px 14px",
    borderTop: "1px solid var(--border)",
    verticalAlign: "middle",
  } satisfies CSSProperties,
  agent: {
    fontWeight: 600,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  time: {
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  version: {
    color: "var(--accent-text)",
    textDecoration: "none",
    fontWeight: 600,
  } satisfies CSSProperties,
  metricCell: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 120,
  } satisfies CSSProperties,
  bar: {
    flex: 1,
  } satisfies CSSProperties,
  metricValue: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    minWidth: 34,
    textAlign: "right",
  } satisfies CSSProperties,
  tally: {
    fontWeight: 700,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "16px 0",
  } satisfies CSSProperties,
} as const;
