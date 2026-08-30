import type { CSSProperties } from "react";

export const s = {
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  row: {
    borderTop: "1px solid var(--border)",
    paddingTop: 10,
  } satisfies CSSProperties,
  rowHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,
  path: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  open: {
    fontSize: 12.5,
    color: "var(--accent-text)",
    textDecoration: "underline",
    flexShrink: 0,
  } satisfies CSSProperties,
  reason: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "4px 0 0",
    lineHeight: 1.4,
  } satisfies CSSProperties,
} as const;
