/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Reply with ONLY minified JSON:\n" +
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
}

/**
 * Yield every top-level {...} span, brace-balanced and string-aware. Slicing from the first "{"
 * to the last "}" instead — as this did — concatenates two objects into `{...}{...}` the moment a
 * judge emits a second one or trails prose containing a brace, and JSON.parse throws on the lot.
 */
function* jsonSpans(text: string): Generator<string> {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        yield text.slice(start, i + 1);
        start = -1;
      }
    }
  }
}

function parseVerdict(text: string): Verdict["results"] {
  for (const span of jsonSpans(text)) {
    let obj: unknown;
    try {
      obj = JSON.parse(span);
    } catch {
      continue;
    }
    const results = (obj as { results?: unknown }).results;
    if (Array.isArray(results)) return results as Verdict["results"];
  }
  throw new Error(`judge returned no JSON object with results[]: ${text.slice(0, 200)}`);
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  const res = await runContent(prompt, { allowedTools: [], maxTurns: 1, model });
  const results = parseVerdict(res.text);
  const total = results.length || 1;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: passed / total };
}
