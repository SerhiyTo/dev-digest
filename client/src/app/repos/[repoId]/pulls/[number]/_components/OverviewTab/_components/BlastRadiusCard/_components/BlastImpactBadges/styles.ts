import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,

  group: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,

  none: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
