import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 4px",
  } satisfies CSSProperties,

  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,

  header: (interactive: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "8px 4px",
    cursor: interactive ? "pointer" : "default",
    color: "var(--text-primary)",
  }),

  headerTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  icon: {
    flexShrink: 0,
  } satisfies CSSProperties,

  title: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,

  headerRef: {
    minWidth: 0,
    overflowWrap: "anywhere",
    paddingLeft: 22,
  } satisfies CSSProperties,

  body: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "0 4px 10px 26px",
  } satisfies CSSProperties,

  explanation: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,

  refs: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,

  refLink: {
    fontSize: 12,
  } satisfies CSSProperties,

  refPlain: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  };
}
