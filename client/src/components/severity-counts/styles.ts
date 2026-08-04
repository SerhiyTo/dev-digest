import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  muted: (size: "sm" | "md"): CSSProperties => ({
    color: "var(--text-muted)",
    fontSize: size === "sm" ? 11.5 : 12.5,
  }),
  item: (color: string, active: boolean, size: "sm" | "md"): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color,
    fontSize: size === "sm" ? 11.5 : 12.5,
    fontWeight: active ? 700 : 500,
    opacity: active ? 1 : 0.85,
    textDecoration: active ? "underline dotted" : "none",
    textUnderlineOffset: 3,
  }),
  button: {
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "inherit",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
