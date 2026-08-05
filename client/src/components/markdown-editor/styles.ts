import type { CSSProperties } from "react";
import type { HighlightKind } from "./helpers";

const FONT_SIZE = 13;
const LINE_HEIGHT = 20;
const EDITOR_PADDING = 12;

export const HIGHLIGHT_STYLE: Record<HighlightKind, CSSProperties> = {
  heading: { color: "var(--accent)", fontWeight: 700 },
  list: { color: "var(--text-secondary)" },
  bold: { fontWeight: 700, color: "var(--text-primary)" },
  code: { color: "var(--sugg)", background: "var(--bg-hover)", borderRadius: 3 },
  plain: { color: "var(--text-primary)" },
};

export const s = {
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  } satisfies CSSProperties,
  filenameIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  filenameChip: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    padding: "2px 8px",
    borderRadius: 5,
  } satisfies CSSProperties,
  tokenChip: {
    marginLeft: "auto",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-muted)",
    cursor: "default",
  } satisfies CSSProperties,

  frame: (height: number): CSSProperties => ({
    display: "flex",
    height,
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  }),
  gutter: {
    flexShrink: 0,
    width: 44,
    overflow: "hidden",
    padding: `${EDITOR_PADDING}px 0`,
    textAlign: "right",
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  gutterLine: {
    fontFamily: "var(--font-mono)",
    fontSize: FONT_SIZE,
    lineHeight: `${LINE_HEIGHT}px`,
    color: "var(--text-muted)",
    paddingRight: 8,
  } satisfies CSSProperties,
  overlayWrap: { position: "relative", flex: 1, minWidth: 0 } satisfies CSSProperties,
  highlightLayer: {
    position: "absolute",
    inset: 0,
    margin: 0,
    padding: EDITOR_PADDING,
    overflow: "auto",
    fontFamily: "var(--font-mono)",
    fontSize: FONT_SIZE,
    lineHeight: `${LINE_HEIGHT}px`,
    whiteSpace: "pre",
    pointerEvents: "none",
  } satisfies CSSProperties,
  codeLine: { minHeight: LINE_HEIGHT } satisfies CSSProperties,
  textarea: {
    position: "absolute",
    inset: 0,
    margin: 0,
    padding: EDITOR_PADDING,
    width: "100%",
    height: "100%",
    resize: "none",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "transparent",
    caretColor: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: FONT_SIZE,
    lineHeight: `${LINE_HEIGHT}px`,
    whiteSpace: "pre",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
