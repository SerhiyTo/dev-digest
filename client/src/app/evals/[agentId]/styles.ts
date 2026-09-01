import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 32px 44px",
    maxWidth: 1180,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } satisfies CSSProperties,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-muted)",
    textDecoration: "none",
    width: "fit-content",
  } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  loadingRow: { display: "flex", gap: 14 } satisfies CSSProperties,
} as const;
