import { describe, it, expect } from "vitest";
import { placeCard, lineLabel } from "./helpers";
import { CARD_WIDTH, VIEWPORT_MARGIN, ANCHOR_GAP } from "./constants";

const VIEWPORT = { width: 1400, height: 800 };

describe("placeCard", () => {
  it("drops below the anchor when there is room", () => {
    const pos = placeCard({ top: 100, bottom: 120, left: 400 }, VIEWPORT);
    expect(pos.top).toBe(120 + ANCHOR_GAP);
    expect(pos.bottom).toBeNull();
  });

  it("flips above and anchors from the bottom edge for a row near the fold", () => {
    const pos = placeCard({ top: 740, bottom: 760, left: 400 }, VIEWPORT);
    expect(pos.top).toBeNull();
    expect(pos.bottom).toBe(VIEWPORT.height - 740 + ANCHOR_GAP);
  });

  it("clamps to the right edge so a last-column anchor stays on screen", () => {
    const pos = placeCard({ top: 100, bottom: 120, left: 1380 }, VIEWPORT);
    expect(pos.left).toBe(VIEWPORT.width - CARD_WIDTH - VIEWPORT_MARGIN);
    expect(pos.left + CARD_WIDTH).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT_MARGIN);
  });

  it("never positions left of the viewport margin", () => {
    expect(placeCard({ top: 100, bottom: 120, left: -50 }, VIEWPORT).left).toBe(VIEWPORT_MARGIN);
  });

  it("keeps a usable height in a short viewport", () => {
    const pos = placeCard({ top: 100, bottom: 120, left: 400 }, { width: 1400, height: 200 });
    expect(pos.maxHeight).toBeGreaterThanOrEqual(120);
  });
});

describe("lineLabel", () => {
  it("shows a single line as-is and a range with a dash", () => {
    expect(lineLabel(12, 12)).toBe("12");
    expect(lineLabel(61, 74)).toBe("61-74");
  });
});
