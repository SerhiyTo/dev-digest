/* formatCost — adaptive-precision USD formatter shared by the PR list Cost
   column, the Agent runs timeline, and the trace drawer COST stat.
   Missing data renders as "—" (never "$0.00"); "$0.00" is reserved for a
   genuinely recorded zero cost (e.g. a free model).
   Spec: specs/2026-07-29-run-cost.md */

export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const rounded = Number(usd.toPrecision(2));
  if (rounded < 0.0001) return "<$0.0001";
  const str = rounded.toString();
  const decimals = str.includes(".") ? str.split(".")[1]!.length : 0;
  return decimals < 2 ? `$${rounded.toFixed(2)}` : `$${str}`;
}
