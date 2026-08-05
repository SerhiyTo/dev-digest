import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  filterWrap: { marginBottom: 10 } satisfies CSSProperties,
  orderHint: {
    fontSize: 12,
    color: "var(--text-muted)",
    margin: "10px 0 18px",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  divider: { height: 1, background: "var(--border)", margin: "14px 0" } satisfies CSSProperties,
  row: (linked: boolean, dragging?: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 7,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: linked ? "var(--border-strong)" : "var(--border)",
    borderStyle: linked ? "solid" : "dashed",
    background: linked ? "var(--bg-elevated)" : "transparent",
    opacity: dragging ? 0.5 : 1,
  }),
  dragHandle: { color: "var(--text-muted)", cursor: "grab", flexShrink: 0 } satisfies CSSProperties,
  dragHandleSpacer: { width: 14, flexShrink: 0 } satisfies CSSProperties,
  badges: { display: "flex", gap: 6, marginLeft: "auto", flexShrink: 0 } satisfies CSSProperties,
} as const;
