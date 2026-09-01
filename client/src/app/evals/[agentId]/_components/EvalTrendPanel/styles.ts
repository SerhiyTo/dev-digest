import type { CSSProperties } from "react";

export const s = {
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  legend: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  legendSwatch: (color: string): CSSProperties => ({
    width: 14,
    height: 2,
    borderRadius: 2,
    background: color,
  }),
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  } satisfies CSSProperties,
  pointList: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
} as const;
