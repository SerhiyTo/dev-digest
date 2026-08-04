import type { CSSProperties } from "react";

export const s = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 14,
  } satisfies CSSProperties,
  emptyChip: {
    opacity: 0.45,
    cursor: "default",
  } satisfies CSSProperties,
  hint: {
    marginLeft: "auto",
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
