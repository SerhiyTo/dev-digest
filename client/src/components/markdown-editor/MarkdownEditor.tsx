/* MarkdownEditor — a transparent textarea layered over a highlighted view, plus
   a scroll-synced line-number gutter.

   Strings arrive as a `labels` prop rather than through useTranslations: a
   shared component bound to one feature's i18n namespace would force every
   later caller to add keys to a file that is not theirs. */
"use client";

import React from "react";
import { Badge, Icon, type IconName } from "@devdigest/ui";
import { DEFAULT_EDITOR_HEIGHT } from "./constants";
import { highlightLine, splitLines } from "./helpers";
import { HIGHLIGHT_STYLE, s } from "./styles";

export interface MarkdownEditorLabels {
  unsaved: string;
  tokens: string;
  placeholder: string;
  tokensHint?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  filename,
  unsaved,
  labels,
  height = DEFAULT_EDITOR_HEIGHT,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  filename: string;
  unsaved: boolean;
  labels: MarkdownEditorLabels;
  height?: number;
  /** Optional glyph before the filename chip; opt-in so existing callers are unchanged. */
  icon?: IconName;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lines = splitLines(value);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  return (
    <div>
      <div style={s.chipRow}>
        {icon &&
          (() => {
            const Glyph = Icon[icon];
            return <Glyph size={14} style={s.filenameIcon} />;
          })()}
        <span style={s.filenameChip}>{filename}</span>
        {unsaved && <Badge color="var(--warn)">{labels.unsaved}</Badge>}
        <span style={s.tokenChip} title={labels.tokensHint}>
          {labels.tokens}
        </span>
      </div>
      <div style={s.frame(height)}>
        <div ref={gutterRef} style={s.gutter}>
          {lines.map((_, i) => (
            <div key={i} style={s.gutterLine}>
              {i + 1}
            </div>
          ))}
        </div>
        <div style={s.overlayWrap}>
          <div ref={highlightRef} style={s.highlightLayer} aria-hidden>
            {lines.map((line, i) => (
              <div key={i} style={s.codeLine}>
                {highlightLine(line).map((seg, j) => (
                  <span key={j} style={HIGHLIGHT_STYLE[seg.kind]}>
                    {seg.text || " "}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            spellCheck={false}
            placeholder={labels.placeholder}
            style={s.textarea}
          />
        </div>
      </div>
    </div>
  );
}
