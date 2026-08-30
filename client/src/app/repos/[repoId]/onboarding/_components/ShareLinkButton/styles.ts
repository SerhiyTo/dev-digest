import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  confirm: {
    fontSize: 12,
    color: "var(--ok)",
  } satisfies CSSProperties,
  failure: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  failureText: {
    fontSize: 12,
    color: "var(--crit)",
  } satisfies CSSProperties,
  urlInput: {
    fontSize: 12,
    padding: "3px 6px",
    borderRadius: 4,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    width: 220,
  } satisfies CSSProperties,
} as const;
