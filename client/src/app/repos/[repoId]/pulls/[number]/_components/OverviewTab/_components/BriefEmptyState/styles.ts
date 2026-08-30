import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "60px 28px",
    gap: 8,
  } satisfies CSSProperties,

  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,

  title: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  body: {
    fontSize: 14,
    color: "var(--text-secondary)",
    maxWidth: 340,
    lineHeight: 1.5,
  } satisfies CSSProperties,

  action: {
    marginTop: 12,
  } satisfies CSSProperties,
} as const;
