import type { CSSProperties } from "react";

/**
 * Border declarations stay on per-side longhands only. Mixing a `border` /
 * `borderColor` shorthand with a side longhand makes React warn on every state
 * toggle (client/INSIGHTS.md).
 */
export const s = {
  card: (accepted: boolean, rejected: boolean): CSSProperties => ({
    display: "flex",
    gap: 16,
    padding: 16,
    borderRadius: 8,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: "var(--border)",
    borderRightColor: "var(--border)",
    borderBottomColor: "var(--border)",
    borderLeftColor: accepted ? "var(--ok)" : "var(--border)",
    background: "var(--bg-elevated)",
    opacity: rejected ? 0.55 : 1,
    transition: "opacity .2s, border-left-color .12s",
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  ruleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  } satisfies CSSProperties,
  rule: (rejected: boolean): CSSProperties => ({
    flex: 1,
    fontSize: 15,
    fontStyle: "italic",
    fontWeight: 600,
    color: rejected ? "var(--text-muted)" : "var(--text-primary)",
    textDecorationLine: rejected ? "line-through" : "none",
  }),
  editWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 12,
  } satisfies CSSProperties,
  editActions: { display: "flex", gap: 8 } satisfies CSSProperties,

  evidence: { marginBottom: 10 } satisfies CSSProperties,
  evidenceLead: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  codeBlock: {
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    overflow: "hidden",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  codeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 10px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  copySlot: { marginLeft: "auto" } satisfies CSSProperties,
  code: {
    margin: 0,
    padding: "10px 12px",
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    lineHeight: "19px",
    color: "var(--text-primary)",
    whiteSpace: "pre",
    overflowX: "auto",
  } satisfies CSSProperties,

  footRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginTop: 12,
  } satisfies CSSProperties,
  confidenceLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  barSlot: { width: 130 } satisfies CSSProperties,
  confidenceValue: {
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  occurrences: {
    fontSize: 12,
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
  } satisfies CSSProperties,

  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 170,
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
