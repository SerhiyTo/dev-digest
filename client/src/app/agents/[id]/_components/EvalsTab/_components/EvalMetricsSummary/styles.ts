import type { CSSProperties } from "react";

export const s = {
  container: { display: "flex", flexDirection: "column" },
  row: { display: "flex", gap: 12 },
  dashboardLink: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--accent-text)",
    textDecoration: "none",
  },
  neverRun: { fontSize: 13, color: "var(--text-muted)" },
  note: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 },
} satisfies Record<string, CSSProperties>;
