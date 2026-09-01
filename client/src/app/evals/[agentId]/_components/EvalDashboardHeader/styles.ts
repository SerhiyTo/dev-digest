import type { CSSProperties } from "react";

export const s = {
  container: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  titleBlock: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h1: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: 0,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  subtitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  casesLink: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    textDecoration: "none",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  controls: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
} as const;
