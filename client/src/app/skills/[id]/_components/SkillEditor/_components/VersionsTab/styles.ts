import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 12,
  } satisfies CSSProperties,
  rowMain: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  versionTag: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  label: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginLeft: "auto" } satisfies CSSProperties,

  diffPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  diffLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
