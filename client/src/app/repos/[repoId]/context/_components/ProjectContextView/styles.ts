import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "28px 32px 48px", maxWidth: 1240 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 6,
  } satisfies CSSProperties,
  headerMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 26, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  repoName: { fontFamily: "var(--font-mono)", color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { marginTop: 6, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  } satisfies CSSProperties,
  syncedAt: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  split: {
    marginTop: 22,
    display: "grid",
    gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  } satisfies CSSProperties,
} as const;
