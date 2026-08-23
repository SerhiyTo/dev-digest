"use client";

import React from "react";

let seq = 0;

/** Mermaid diagrams must start with a known graph keyword. Anything else
 *  (prose, JSON like {"type":"Buffer"...}, empty) is not a diagram → skip. */
const MERMAID_RE =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context)\b/;

function looksLikeMermaid(src: string): boolean {
  return MERMAID_RE.test(src.trim());
}

const DIAGRAM_CSS = `
  .node rect, .node polygon, .node circle, .node path {
    fill: none !important;
  }
  .node rect {
    rx: 8px !important;
    ry: 8px !important;
    stroke-width: 1.5px !important;
    stroke: var(--border-strong) !important;
  }
  .node.entrypoint rect { stroke: var(--accent) !important; }
  .node.crosscut rect { stroke: var(--warn) !important; }
  .node.datastore rect { stroke: var(--ok) !important; }
  .node.external rect { stroke: var(--info) !important; }
  .node .nodeLabel, .node text, .node span {
    fill: var(--text-primary) !important;
    color: var(--text-primary) !important;
  }
  .edgePath path, path.flowchart-link {
    stroke: var(--border-strong) !important;
    stroke-width: 1.25px !important;
  }
  .marker, .marker path {
    fill: var(--border-strong) !important;
    stroke: var(--border-strong) !important;
  }
  .edgeLabel, .edgeLabel rect, .edgeLabel .labelBkg {
    fill: var(--bg-elevated) !important;
    background: var(--bg-elevated) !important;
    color: var(--text-secondary) !important;
  }
  .cluster rect {
    fill: none !important;
    stroke: var(--border) !important;
    rx: 10px !important;
    ry: 10px !important;
  }
`;

/**
 * Renders a mermaid diagram string to inline SVG. mermaid is imported lazily
 * (client-only). We VALIDATE with mermaid.parse({suppressErrors}) before
 * rendering — mermaid otherwise injects a "Syntax error" bomb graphic into the
 * DOM on bad input instead of throwing. Junk/unparseable input renders nothing.
 */
export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<"pending" | "ok" | "invalid">("pending");

  React.useEffect(() => {
    let cancelled = false;
    const src = (chart ?? "").trim();
    if (!looksLikeMermaid(src)) {
      setState("invalid");
      return;
    }
    setState("pending");
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.dataset.theme === "light" ? "neutral" : "dark",
          securityLevel: "strict",
          themeCSS: DIAGRAM_CSS,
        });
        // parse first; suppressErrors → returns false (no throw, no DOM bomb).
        const valid = await mermaid.parse(src, { suppressErrors: true });
        if (cancelled) return;
        if (!valid) {
          setState("invalid");
          return;
        }
        const { svg } = await mermaid.render(`dd-mermaid-${seq++}`, src);
        if (cancelled) return;
        if (ref.current) ref.current.innerHTML = svg;
        setState("ok");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  // Not a (valid) diagram → render nothing rather than a broken box.
  if (state === "invalid") return null;

  return (
    <div
      ref={ref}
      style={{
        display: state === "ok" ? "flex" : "none",
        justifyContent: "center",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        overflowX: "auto",
      }}
    />
  );
}

export default MermaidDiagram;
