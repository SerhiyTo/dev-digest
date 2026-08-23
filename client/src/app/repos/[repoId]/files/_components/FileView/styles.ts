import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "20px 28px",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid var(--border)",
    paddingBottom: 10,
  } satisfies CSSProperties,
  path: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  content: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  } satisfies CSSProperties,
} as const;
