import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,

  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,

  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,

  ref: {
    flexShrink: 0,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  reason: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
  } satisfies CSSProperties,

  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "10px 0",
  } satisfies CSSProperties,
} as const;
