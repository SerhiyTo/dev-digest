import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  text: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
