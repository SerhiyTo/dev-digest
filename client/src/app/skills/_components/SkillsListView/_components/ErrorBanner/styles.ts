import type { CSSProperties } from "react";

export const s = {
  banner: {
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 700, color: "var(--crit)" } satisfies CSSProperties,
  message: { fontSize: 12, color: "var(--crit)", marginTop: 4, lineHeight: 1.45 } satisfies CSSProperties,
} as const;
