"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { layoutGraph, NODE_W, NODE_H } from "../../helpers";
import { s } from "./styles";

export function BlastGraph({
  downstream,
  summary,
}: {
  downstream: DownstreamImpact[];
  summary: string;
}) {
  const t = useTranslations("blast");
  const [hovered, setHovered] = React.useState<string | null>(null);

  const hasCallers = downstream.some((item) => item.callers.length > 0);
  if (downstream.length === 0 || !hasCallers) {
    return <EmptyState icon="Workflow" title={t("graph.empty")} />;
  }

  const { nodes, edges, width, height } = layoutGraph(downstream);
  const ariaLabel = t("graph.ariaLabel", {
    symbols: downstream.length,
    files: nodes.filter((node) => node.kind === "file").length,
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{ariaLabel}</title>
        <desc>{summary}</desc>
        {edges.map((edge) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const d = `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`;
          return <path key={edge.id} d={d} style={s.edge(hovered === edge.from)} />;
        })}
        {nodes.map((node) => {
          const nodeLabel = node.kind === "more" ? t("graph.more", { count: node.count }) : node.label;
          const nodeTitle = node.kind === "more" ? t("graph.more", { count: node.count }) : node.fullLabel;
          return (
            <g
              key={node.id}
              onMouseEnter={node.kind === "symbol" ? () => setHovered(node.id) : undefined}
              onMouseLeave={node.kind === "symbol" ? () => setHovered(null) : undefined}
            >
              <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={4} style={s.rect(node.kind)} />
              <text x={node.x + 8} y={node.y + NODE_H / 2 + 4} className="mono" style={s.label(node.kind)}>
                {nodeLabel}
              </text>
              <title>{nodeTitle}</title>
            </g>
          );
        })}
      </svg>
      <div style={s.hint}>{t("graph.hint")}</div>
    </div>
  );
}
