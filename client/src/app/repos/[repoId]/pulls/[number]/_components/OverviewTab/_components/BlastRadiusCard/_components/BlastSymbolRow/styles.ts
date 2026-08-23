import type { CSSProperties } from "react";

export const s = {
  row: {
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,

  header: (interactive: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 4px",
    cursor: interactive ? "pointer" : "default",
    color: "var(--text-primary)",
  }),

  icon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  name: {
    fontSize: 13,
    fontWeight: 600,
  } satisfies CSSProperties,

  file: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  spacer: {
    flex: 1,
  } satisfies CSSProperties,

  count: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  body: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "0 4px 10px 29px",
  } satisfies CSSProperties,

  caller: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
  } satisfies CSSProperties,

  callerPath: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  callerName: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  typeMarker: {
    padding: "1px 6px",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
} as const;

export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
  };
}
