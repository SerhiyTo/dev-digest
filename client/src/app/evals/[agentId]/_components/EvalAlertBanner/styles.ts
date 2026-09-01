import type { CSSProperties } from "react";

export const s = {
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 9,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", margin: 0 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  item: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;
