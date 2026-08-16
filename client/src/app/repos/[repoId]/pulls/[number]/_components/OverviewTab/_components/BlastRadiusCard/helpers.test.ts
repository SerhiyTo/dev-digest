import { describe, it, expect } from "vitest";
import type { BlastCaller, DownstreamImpact } from "@devdigest/shared";
import {
  basename,
  ellipsize,
  parseEndpoint,
  formatCron,
  layoutGraph,
  callerLabelKind,
  MAX_GRAPH_SYMBOLS,
  MAX_GRAPH_FILES,
} from "./helpers";

describe("parseEndpoint", () => {
  it("splits a well-formed method + path", () => {
    expect(parseEndpoint("GET /api/public/items")).toEqual({ method: "GET", path: "/api/public/items" });
  });

  it("treats a method-less string as a bare path with no method", () => {
    expect(parseEndpoint("/api/public/items")).toEqual({ method: null, path: "/api/public/items" });
  });

  it("falls back to method:null on garbage input rather than throwing", () => {
    expect(parseEndpoint("not-an-endpoint")).toEqual({ method: null, path: "not-an-endpoint" });
    expect(parseEndpoint("")).toEqual({ method: null, path: "" });
  });
});

describe("ellipsize", () => {
  it("returns the label unchanged when it fits", () => {
    expect(ellipsize("short", 20)).toBe("short");
  });

  it("truncates and appends an ellipsis when the label is too long", () => {
    expect(ellipsize("a-very-long-symbol-name", 10)).toBe("a-very-lo…");
    expect(ellipsize("a-very-long-symbol-name", 10).length).toBe(10);
  });
});

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("src/middleware/ratelimit.ts")).toBe("ratelimit.ts");
  });

  it("returns the input unchanged when there is no separator", () => {
    expect(basename("ratelimit.ts")).toBe("ratelimit.ts");
  });
});

describe("formatCron", () => {
  it("returns a plain cron expression unchanged", () => {
    expect(formatCron("reset-rate-buckets")).toBe("reset-rate-buckets");
  });

  it("strips the job: prefix form", () => {
    expect(formatCron("job:reset-rate-buckets")).toBe("reset-rate-buckets");
  });
});

function downstreamWithCallers(symbolCount: number, filesPerSymbol: number, sharedFile?: string): DownstreamImpact[] {
  return Array.from({ length: symbolCount }, (_, i) => ({
    symbol: `symbol${i}`,
    callers: Array.from({ length: filesPerSymbol }, (_, j) => ({
      name: `caller${i}_${j}`,
      file: sharedFile ?? `src/generated/file${i}_${j}.ts`,
      line: 1,
    })),
    endpoints_affected: [],
    crons_affected: [],
  }));
}

describe("callerLabelKind", () => {
  it("returns call when every caller has kind: call", () => {
    const callers: BlastCaller[] = [
      { name: "a", file: "src/a.ts", line: 1, kind: "call" },
      { name: "b", file: "src/b.ts", line: 2, kind: "call" },
    ];
    expect(callerLabelKind(callers)).toBe("call");
  });

  it("treats a missing kind as call", () => {
    const callers: BlastCaller[] = [{ name: "a", file: "src/a.ts", line: 1 }];
    expect(callerLabelKind(callers)).toBe("call");
  });

  it("returns type when every caller has kind: type", () => {
    const callers: BlastCaller[] = [
      { name: "a", file: "src/a.ts", line: 1, kind: "type" },
      { name: "b", file: "src/b.ts", line: 2, kind: "type" },
    ];
    expect(callerLabelKind(callers)).toBe("type");
  });

  it("returns mixed when callers combine call and type", () => {
    const callers: BlastCaller[] = [
      { name: "a", file: "src/a.ts", line: 1, kind: "call" },
      { name: "b", file: "src/b.ts", line: 2, kind: "type" },
    ];
    expect(callerLabelKind(callers)).toBe("mixed");
  });

  it("returns call for an empty caller list", () => {
    expect(callerLabelKind([])).toBe("call");
  });
});

describe("layoutGraph", () => {
  it("places the first symbol node at the left column and its first file at the right column", () => {
    const downstream: DownstreamImpact[] = [
      {
        symbol: "rateLimit",
        callers: [{ name: "registerRoutes", file: "src/api/public/index.ts", line: 23 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ];

    const { nodes, edges, width } = layoutGraph(downstream);
    const symbolNode = nodes.find((n) => n.id === "symbol:0");
    const fileNode = nodes.find((n) => n.id === "file:0");

    expect(symbolNode).toBeDefined();
    expect(fileNode).toBeDefined();
    expect(symbolNode!.x).toBe(8);
    expect(fileNode!.x).toBe(width - 8 - 128);
    expect(edges).toEqual([{ id: "symbol:0->file:0", from: "symbol:0", to: "file:0" }]);
  });

  it("caps symbol and file nodes at MAX_GRAPH_SYMBOLS/MAX_GRAPH_FILES and adds an overflow node for each", () => {
    const downstream = downstreamWithCallers(MAX_GRAPH_SYMBOLS + 2, 1);
    const { nodes } = layoutGraph(downstream);

    const symbolNodes = nodes.filter((n) => n.kind === "symbol");
    const fileNodes = nodes.filter((n) => n.kind === "file");
    const overflowNodes = nodes.filter((n) => n.kind === "more");

    expect(symbolNodes.length).toBe(MAX_GRAPH_SYMBOLS);
    expect(fileNodes.length).toBeLessThanOrEqual(MAX_GRAPH_FILES);
    expect(overflowNodes.some((n) => n.id === "symbol:more" && n.count === 2)).toBe(true);
  });

  it("caps unique caller files at MAX_GRAPH_FILES and reports the overflow count", () => {
    const downstream = downstreamWithCallers(2, MAX_GRAPH_FILES + 3);
    const { nodes } = layoutGraph(downstream);

    const fileNodes = nodes.filter((n) => n.kind === "file");
    const overflow = nodes.find((n) => n.id === "file:more");

    expect(fileNodes.length).toBe(MAX_GRAPH_FILES);
    expect(overflow?.count).toBe(2 * (MAX_GRAPH_FILES + 3) - MAX_GRAPH_FILES);
  });

  it("dedups an edge when two callers of the same symbol share a file", () => {
    const downstream: DownstreamImpact[] = [
      {
        symbol: "rateLimit",
        callers: [
          { name: "a", file: "src/server.ts", line: 10 },
          { name: "b", file: "src/server.ts", line: 20 },
        ],
        endpoints_affected: [],
        crons_affected: [],
      },
    ];

    const { edges, nodes } = layoutGraph(downstream);
    const fileNodes = nodes.filter((n) => n.kind === "file");

    expect(fileNodes.length).toBe(1);
    expect(edges.length).toBe(1);
    expect(edges[0]).toEqual({ id: "symbol:0->file:0", from: "symbol:0", to: "file:0" });
  });
});
