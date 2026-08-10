import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    minHeight: 240,
  } satisfies CSSProperties,

  body: {
    display: "grid",
    placeItems: "center",
    flex: 1,
  } satisfies CSSProperties,
} as const;
