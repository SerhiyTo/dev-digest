import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 6,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
} as const;

export function tabFor(active: boolean): CSSProperties {
  return {
    padding: "3px 10px",
    borderRadius: 5,
    borderWidth: 0,
    borderStyle: "none",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    background: active ? "var(--bg-elevated)" : "transparent",
  };
}
