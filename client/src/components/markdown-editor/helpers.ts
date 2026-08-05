import { BOLD_RE, HEADING_RE, INLINE_CODE_RE, INLINE_TOKEN_RE, LIST_MARKER_RE } from "./constants";

export type HighlightKind = "heading" | "list" | "bold" | "code" | "plain";

export interface HighlightSegment {
  text: string;
  kind: HighlightKind;
}

export function splitLines(body: string): string[] {
  return body.length === 0 ? [""] : body.split("\n");
}

export function highlightLine(line: string): HighlightSegment[] {
  const lineLevelKind: HighlightKind = HEADING_RE.test(line)
    ? "heading"
    : LIST_MARKER_RE.test(line)
      ? "list"
      : "plain";
  const parts = line.split(INLINE_TOKEN_RE).filter((part) => part.length > 0);
  if (parts.length === 0) return [{ text: "", kind: lineLevelKind }];
  return parts.map((part) => {
    if (BOLD_RE.test(part)) return { text: part, kind: "bold" };
    if (INLINE_CODE_RE.test(part)) return { text: part, kind: "code" };
    return { text: part, kind: lineLevelKind };
  });
}
