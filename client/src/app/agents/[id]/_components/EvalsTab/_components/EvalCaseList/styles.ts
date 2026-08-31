import type { CSSProperties } from "react";

export const s = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  heading: {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
  } satisfies CSSProperties,
  headerSpacer: {
    marginLeft: "auto",
  } satisfies CSSProperties,
  statusText: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "12px 0",
  } satisfies CSSProperties,
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
    padding: 16,
    borderRadius: 8,
    border: "1px dashed var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  emptyText: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
    lineHeight: 1.4,
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  statusIcon: {
    display: "inline-grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  rowMain: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,
  name: {
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  expectation: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
