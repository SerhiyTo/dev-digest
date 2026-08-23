import type { CSSProperties } from "react";
import type { GraphNodeKind } from "../../helpers";

export const s = {
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  edge: (active: boolean): CSSProperties => ({
    fill: "none",
    stroke: active ? "var(--accent)" : "var(--border)",
    strokeWidth: active ? 1.5 : 1,
  }),

  rect: (kind: GraphNodeKind): CSSProperties => {
    if (kind === "symbol") return { fill: "var(--accent-bg)", stroke: "var(--accent)" };
    if (kind === "file") return { fill: "var(--bg-hover)", stroke: "var(--border)" };
    return { fill: "var(--bg-hover)", stroke: "var(--border)", strokeDasharray: "3 2" };
  },

  label: (kind: GraphNodeKind): CSSProperties => ({
    fontSize: 10.5,
    fill: kind === "more" ? "var(--text-muted)" : "var(--text-primary)",
  }),
} as const;
