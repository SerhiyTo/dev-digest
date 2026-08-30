import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  item: {
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,
  commandBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,
  command: {
    fontSize: 13,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    userSelect: "text",
  } satisfies CSSProperties,
  note: {
    fontSize: 12,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  copyFailed: {
    fontSize: 12,
    color: "var(--crit)",
    margin: "6px 0 0",
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
} as const;
