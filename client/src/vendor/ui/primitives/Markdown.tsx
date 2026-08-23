import React from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

const BlockCodeContext = React.createContext(false);

const schemeTransforms = new Map<string, (url: string) => string>();

function protocolOf(url: string): string | null {
  const colon = url.indexOf(":");
  if (colon === -1) return null;
  for (const sep of ["/", "?", "#"]) {
    const at = url.indexOf(sep);
    if (at !== -1 && at < colon) return null;
  }
  return url.slice(0, colon).toLowerCase();
}

function urlTransformFor(schemes: string[] | undefined) {
  if (!schemes) return undefined;
  const key = schemes.join(",").toLowerCase();
  const cached = schemeTransforms.get(key);
  if (cached) return cached;
  const allowed = new Set(schemes.map((scheme) => scheme.toLowerCase()));
  const transform = (url: string): string => {
    const safe = defaultUrlTransform(url);
    if (!safe) return "";
    const protocol = protocolOf(safe);
    if (protocol === null) return safe;
    return allowed.has(protocol) ? safe : "";
  };
  schemeTransforms.set(key, transform);
  return transform;
}

const headingStyle = (fontSize: number, marginTop: number): React.CSSProperties => ({
  fontSize,
  fontWeight: 650,
  color: "var(--text-primary)",
  margin: `${marginTop}px 0 8px`,
  lineHeight: 1.3,
});

const listStyle: React.CSSProperties = {
  margin: "0 0 10px",
  paddingLeft: 22,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const cellStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  borderRight: "1px solid var(--border)",
  borderBottom: "1px solid var(--border)",
  borderLeft: "1px solid var(--border)",
  padding: "5px 9px",
  textAlign: "left",
  verticalAlign: "top",
};

function MarkdownCode({ children }: { children?: React.ReactNode }) {
  const block = React.useContext(BlockCodeContext);
  return (
    <code
      className="mono"
      style={
        block
          ? { fontSize: "0.92em", color: "var(--text-primary)", background: "none", padding: 0 }
          : {
              fontSize: "0.92em",
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--bg-hover)",
              color: "var(--accent-text)",
            }
      }
    >
      {children}
    </code>
  );
}

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({
  children,
  allowedUrlSchemes,
}: {
  children?: string | null;
  allowedUrlSchemes?: string[];
}) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransformFor(allowedUrlSchemes)}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          h1: ({ children }) => <h1 style={headingStyle(19, 18)}>{children}</h1>,
          h2: ({ children }) => <h2 style={headingStyle(17, 18)}>{children}</h2>,
          h3: ({ children }) => <h3 style={headingStyle(15, 16)}>{children}</h3>,
          h4: ({ children }) => <h4 style={headingStyle(14, 14)}>{children}</h4>,
          h5: ({ children }) => <h5 style={headingStyle(13, 12)}>{children}</h5>,
          h6: ({ children }) => <h6 style={headingStyle(13, 12)}>{children}</h6>,
          ul: ({ children }) => <ul style={{ ...listStyle, listStyleType: "disc" }}>{children}</ul>,
          ol: ({ children }) => (
            <ol style={{ ...listStyle, listStyleType: "decimal" }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ paddingLeft: 2 }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0 0 10px",
                paddingLeft: 12,
                borderLeft: "2px solid var(--border-strong)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.95em", width: "100%" }}>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{ ...cellStyle, fontWeight: 650, background: "var(--bg-hover)" }}>
              {children}
            </th>
          ),
          td: ({ children }) => <td style={cellStyle}>{children}</td>,
          pre: ({ children }) => (
            <BlockCodeContext.Provider value={true}>
              <pre
                style={{
                  margin: "0 0 12px",
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  overflowX: "auto",
                  whiteSpace: "pre",
                }}
              >
                {children}
              </pre>
            </BlockCodeContext.Provider>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => <MarkdownCode>{children}</MarkdownCode>,
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
