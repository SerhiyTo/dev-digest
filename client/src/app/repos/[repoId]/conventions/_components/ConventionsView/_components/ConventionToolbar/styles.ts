import type { CSSProperties } from "react";

export const s = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    paddingBottom: 4,
  } satisfies CSSProperties,
  counter: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
