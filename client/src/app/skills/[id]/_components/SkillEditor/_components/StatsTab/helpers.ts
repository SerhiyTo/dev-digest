import type { DonutSegment } from "@devdigest/ui";

const DONUT_SEGMENT_COLOR_PALETTE: readonly string[] = [
  "var(--accent)",
  "var(--ok)",
  "var(--warn)",
  "var(--crit)",
  "var(--sugg)",
  "var(--info)",
];

export function toNonZeroDonutSegments(byCategory: Record<string, number>): DonutSegment[] {
  return Object.entries(byCategory)
    .filter(([, count]) => count > 0)
    .map(([label, value], i) => ({
      label,
      value,
      color: DONUT_SEGMENT_COLOR_PALETTE[i % DONUT_SEGMENT_COLOR_PALETTE.length]!,
    }));
}
