import type { CSSProperties } from "react";

export const s = {
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  diagram: {
    marginTop: 12,
  } satisfies CSSProperties,
} as const;
