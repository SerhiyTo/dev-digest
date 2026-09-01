import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1180, margin: "0 auto" } satisfies CSSProperties,
  header: { marginBottom: 26 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
    marginTop: 6,
  } satisfies CSSProperties,
  section: { marginBottom: 30 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  skeletons: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
