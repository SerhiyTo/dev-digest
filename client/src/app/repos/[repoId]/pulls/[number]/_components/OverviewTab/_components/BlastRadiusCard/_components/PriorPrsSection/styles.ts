import type { CSSProperties } from "react";

export const s = {
  section: {
    borderTop: "1px solid var(--border)",
    paddingTop: 10,
    marginTop: "auto",
  } satisfies CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    color: "var(--text-primary)",
    padding: "4px 0",
  } satisfies CSSProperties,

  icon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  title: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  spacer: {
    flex: 1,
  } satisfies CSSProperties,

  body: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingTop: 8,
  } satisfies CSSProperties,

  empty: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12.5,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  number: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  itemTitle: {
    color: "var(--text-primary)",
    flex: 1,
    minWidth: 120,
  } satisfies CSSProperties,

  author: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  time: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  overlap: {
    color: "var(--text-muted)",
    cursor: "help",
  } satisfies CSSProperties,
} as const;

export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
  };
}
