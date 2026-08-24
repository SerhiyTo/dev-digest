import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,

  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  content: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  badges: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  cardGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 16,
    alignItems: "stretch",
  } satisfies CSSProperties,

  risksCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,

  failure: {
    border: "1px solid var(--crit)",
    borderRadius: 8,
    background: "var(--crit-bg)",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,

  failureTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--crit)",
  } satisfies CSSProperties,

  failureDetail: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,

  failureCost: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,

  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  confirmFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  } satisfies CSSProperties,

  confirmBody: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  confirmText: {
    margin: 0,
    fontSize: 13.5,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
