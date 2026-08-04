import type { CSSProperties } from "react";

export const s = {
  reviewInProgress: {
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  reviewInProgressText: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  reviewInProgressSub: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  lethalTrifecta: {
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  lethalTrifectaTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--crit)",
  } satisfies CSSProperties,
  liveRunSection: {
    marginBottom: 18,
  } satisfies CSSProperties,
  timelineSection: {
    marginBottom: 18,
  } satisfies CSSProperties,
  cancelActions: {
    display: "flex",
    gap: 8,
  } satisfies CSSProperties,
  hiddenRuns: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  hiddenRunsClear: {
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "inherit",
    fontSize: "inherit",
    color: "var(--accent-text)",
    cursor: "pointer",
    textDecoration: "underline dotted",
    textUnderlineOffset: 3,
  } satisfies CSSProperties,
} as const;
