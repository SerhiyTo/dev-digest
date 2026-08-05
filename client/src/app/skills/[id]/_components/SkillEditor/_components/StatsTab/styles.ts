import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 820, display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  heading: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  disclaimer: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    margin: 0,
    maxWidth: 640,
  } satisfies CSSProperties,
  metricsRow: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  h3: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    margin: 0,
  } satisfies CSSProperties,
  agentsList: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  agentLink: { fontSize: 13, color: "var(--accent-text)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
