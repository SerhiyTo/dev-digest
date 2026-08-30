import type { CSSProperties } from "react";

export const s = {
  rail: {
    position: "sticky",
    top: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 180,
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderLeft: "1px solid var(--border)",
  } satisfies CSSProperties,
  listItem: {} satisfies CSSProperties,
  item: (active: boolean): CSSProperties => ({
    display: "block",
    padding: "5px 12px",
    fontSize: 13,
    borderLeft: "2px solid " + (active ? "var(--accent)" : "transparent"),
    marginLeft: -1,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: active ? 600 : 500,
    textDecoration: "none",
  }),
} as const;
