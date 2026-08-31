import type { CSSProperties } from "react";

export const s = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 28,
    padding: "20px 28px 40px",
    maxWidth: 1040,
  } satisfies CSSProperties,
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
