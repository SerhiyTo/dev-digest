import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minHeight: 240,
  } satisfies CSSProperties,

  statement: {
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-primary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,

  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,

  scopeHead: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color,
    marginBottom: 8,
  }),

  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,

  item: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
    paddingLeft: 12,
    position: "relative",
  } satisfies CSSProperties,

  bullet: {
    position: "absolute",
    left: 0,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  divider: {
    borderTop: "1px solid var(--border)",
    paddingTop: 14,
  } satisfies CSSProperties,

  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,

  footer: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: "auto",
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  coverage: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    cursor: "help",
  } satisfies CSSProperties,

  coverageDot: (value: number | null | undefined): CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: 99,
    background:
      value == null
        ? "var(--text-muted)"
        : value >= 0.75
          ? "var(--ok)"
          : value >= 0.4
            ? "var(--warn)"
            : "var(--text-muted)",
  }),
} as const;
