import type { CSSProperties } from "react";

export const s = {
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  } satisfies CSSProperties,
} as const;
