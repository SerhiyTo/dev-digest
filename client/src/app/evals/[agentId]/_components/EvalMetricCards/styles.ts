import type { CSSProperties } from "react";

export const s = {
  container: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  neverRun: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "18px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    margin: 0,
  } satisfies CSSProperties,
} as const;
