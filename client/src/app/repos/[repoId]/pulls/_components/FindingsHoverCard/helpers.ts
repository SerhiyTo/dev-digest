import { ANCHOR_GAP, CARD_MAX_HEIGHT, CARD_WIDTH, VIEWPORT_MARGIN } from "./constants";

export interface CardPosition {
  left: number;
  top: number | null;
  bottom: number | null;
  maxHeight: number;
}

export function placeCard(
  anchor: { top: number; bottom: number; left: number },
  viewport: { width: number; height: number } = {
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  },
): CardPosition {
  const roomBelow = viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
  const roomAbove = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN;
  const above = roomBelow < Math.min(CARD_MAX_HEIGHT, roomAbove);

  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - CARD_WIDTH - VIEWPORT_MARGIN);
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, maxLeft));

  const maxHeight = Math.max(120, Math.min(CARD_MAX_HEIGHT, above ? roomAbove : roomBelow));

  return above
    ? { left, top: null, bottom: viewport.height - anchor.top + ANCHOR_GAP, maxHeight }
    : { left, top: anchor.bottom + ANCHOR_GAP, bottom: null, maxHeight };
}

export function lineLabel(start: number, end: number): string {
  return end > start ? `${start}-${end}` : String(start);
}
