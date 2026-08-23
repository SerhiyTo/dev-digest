import type { BlastCaller, DownstreamImpact } from "@devdigest/shared";

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function callerLabelKind(callers: BlastCaller[]): "call" | "type" | "mixed" {
  if (callers.length === 0) return "call";
  const kinds = new Set(callers.map((caller) => caller.kind ?? "call"));
  if (kinds.size > 1) return "mixed";
  return kinds.has("type") ? "type" : "call";
}

export function ellipsize(label: string, max: number): string {
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(0, max - 1))}…`;
}

export function parseEndpoint(raw: string): { method: string | null; path: string } {
  const match = /^([A-Z]+)\s+(.+)$/.exec(raw);
  if (!match || match[1] == null || match[2] == null) return { method: null, path: raw };
  return { method: match[1], path: match[2] };
}

export function formatCron(raw: string): string {
  return raw.startsWith("job:") ? raw.slice(4) : raw;
}

export const NODE_W = 128;
export const NODE_H = 22;
export const ROW = 30;
export const PAD_Y = 12;
export const GRAPH_WIDTH = 320;
export const MAX_GRAPH_SYMBOLS = 8;
export const MAX_GRAPH_FILES = 12;

export type GraphNodeKind = "symbol" | "file" | "more";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  fullLabel: string;
  count?: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

export function layoutGraph(downstream: DownstreamImpact[]): GraphLayout {
  const symbolItems = downstream.slice(0, MAX_GRAPH_SYMBOLS);
  const symbolOverflow = Math.max(0, downstream.length - MAX_GRAPH_SYMBOLS);

  const fileOrder: string[] = [];
  const seenFiles = new Set<string>();
  for (const item of downstream) {
    for (const caller of item.callers) {
      if (!seenFiles.has(caller.file)) {
        seenFiles.add(caller.file);
        fileOrder.push(caller.file);
      }
    }
  }
  const fileItems = fileOrder.slice(0, MAX_GRAPH_FILES);
  const fileOverflow = Math.max(0, fileOrder.length - MAX_GRAPH_FILES);

  const leftRows = symbolItems.length + (symbolOverflow > 0 ? 1 : 0);
  const rightRows = fileItems.length + (fileOverflow > 0 ? 1 : 0);
  const rows = Math.max(leftRows, rightRows, 1);
  const height = PAD_Y * 2 + rows * ROW;

  const leftX = 8;
  const rightX = GRAPH_WIDTH - 8 - NODE_W;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const fileNodeId = new Map<string, string>();

  fileItems.forEach((file, i) => {
    const id = `file:${i}`;
    fileNodeId.set(file, id);
    nodes.push({
      id,
      kind: "file",
      label: ellipsize(basename(file), 20),
      fullLabel: file,
      x: rightX,
      y: PAD_Y + i * ROW,
    });
  });
  if (fileOverflow > 0) {
    nodes.push({
      id: "file:more",
      kind: "more",
      label: "",
      fullLabel: "",
      count: fileOverflow,
      x: rightX,
      y: PAD_Y + fileItems.length * ROW,
    });
  }

  symbolItems.forEach((item, i) => {
    const id = `symbol:${i}`;
    nodes.push({
      id,
      kind: "symbol",
      label: ellipsize(item.symbol, 20),
      fullLabel: item.symbol,
      x: leftX,
      y: PAD_Y + i * ROW,
    });
    for (const caller of item.callers) {
      const toId = fileNodeId.get(caller.file);
      if (!toId) continue;
      const edgeId = `${id}->${toId}`;
      if (!edges.some((e) => e.id === edgeId)) edges.push({ id: edgeId, from: id, to: toId });
    }
  });
  if (symbolOverflow > 0) {
    nodes.push({
      id: "symbol:more",
      kind: "more",
      label: "",
      fullLabel: "",
      count: symbolOverflow,
      x: leftX,
      y: PAD_Y + symbolItems.length * ROW,
    });
  }

  return { nodes, edges, width: GRAPH_WIDTH, height };
}
