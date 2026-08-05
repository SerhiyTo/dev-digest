import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "28px 32px 48px", maxWidth: 1100 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 6,
  } satisfies CSSProperties,
  headerMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 26, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  repoName: { fontFamily: "var(--font-mono)", color: "var(--accent)" } satisfies CSSProperties,
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  } satisfies CSSProperties,
  scopeField: { width: 220 } satisfies CSSProperties,
  toolbarSpacing: { marginTop: 22 } satisfies CSSProperties,
  list: {
    marginTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
} as const;
