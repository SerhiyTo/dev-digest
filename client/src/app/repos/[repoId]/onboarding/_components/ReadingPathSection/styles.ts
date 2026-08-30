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
    gap: 12,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    gap: 10,
  } satisfies CSSProperties,
  index: {
    flexShrink: 0,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 600,
    display: "grid",
    placeItems: "center",
  } satisfies CSSProperties,
  path: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  rationale: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "2px 0 0",
    lineHeight: 1.4,
  } satisfies CSSProperties,
} as const;
