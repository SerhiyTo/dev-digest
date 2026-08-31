import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  hint: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  confirmation: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  confirmationText: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
