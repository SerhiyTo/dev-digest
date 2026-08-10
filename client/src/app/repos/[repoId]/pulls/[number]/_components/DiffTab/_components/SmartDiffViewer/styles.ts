import type { CSSProperties } from "react";
import type { SmartDiffRole } from "@devdigest/shared";
import { ROLE_DOT } from "./constants";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBottom: 2,
  } satisfies CSSProperties,
  groupLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  groupSubtitle: {
    fontSize: 12,
    fontStyle: "italic",
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  groupCount: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  files: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  splitBanner: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  splitTitle: { fontSize: 13, fontWeight: 600, color: "var(--warn)" } satisfies CSSProperties,
  splitBody: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  splitList: { margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  summary: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  unavailable: {
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggle: { display: "inline-flex", gap: 2 } satisfies CSSProperties,
} as const;

export function groupDotFor(role: SmartDiffRole): CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: 2,
    background: ROLE_DOT[role],
    flexShrink: 0,
  };
}
