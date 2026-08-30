/**
 * Static quality checks for SKILL.md files — no model, no network. The fast gate to run
 * before the (slower) LLM evals.
 *
 *   pnpm eval:quality                 # all skills under .claude/skills
 *   pnpm eval:quality onion-architecture
 *
 * It also gates the workflow tier's file-read expectations. A case that expects a read of a path
 * that no longer exists can never pass, and costs a full model session per CI run to say so — the
 * three that shipped this way all outlived a docs move (insights/gotchas.md -> INSIGHTS.md).
 * Two seconds of existsSync buys that back.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import matter from "gray-matter";
import { REPO_ROOT, SKILLS_DIR, EVALS_DIR } from "./artifacts/paths.js";
import type { WorkflowCase } from "./dsl/case.js";

const REQUIRED = ["name", "description"];
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

interface Report {
  skill: string;
  errors: string[];
  warnings: string[];
  verdict: "PASS" | "WARN" | "FAIL";
}

function* internalLinks(body: string): Generator<[string, string]> {
  for (const m of body.matchAll(LINK_RE)) {
    const target = m[2];
    if (/^(https?:|#|mailto:)/.test(target)) continue;
    const path = target.split("#")[0];
    if (path) yield [target, path];
  }
}

function evaluate(skillDir: string): Report {
  const name = basename(skillDir);
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) {
    return { skill: name, errors: [`SKILL.md not found in ${skillDir}`], warnings: [], verdict: "FAIL" };
  }
  const { data: fm, content: body } = matter(readFileSync(skillMd, "utf8"));
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const f of REQUIRED) {
    if (!(f in fm)) errors.push(`missing frontmatter field: ${f}`);
    else if (!fm[f]) errors.push(`empty frontmatter field: ${f}`);
  }
  if (fm.name && fm.name !== name) errors.push(`frontmatter name '${fm.name}' != directory '${name}'`);
  if (body.length < 100) errors.push("SKILL.md body suspiciously short (< 100 chars)");
  if (body.split("\n").filter((l) => l.startsWith("#")).length < 2) errors.push("fewer than 2 headings — likely incomplete");
  for (const [target, path] of internalLinks(body)) {
    if (!existsSync(join(skillDir, path))) errors.push(`broken reference (${target}) — not found: ${path}`);
  }

  const evalFile = join(EVALS_DIR, "skills", name, `${name}.eval.ts`);
  if (!existsSync(evalFile)) warnings.push(`no eval file (expected: ${evalFile.replace(REPO_ROOT + "/", "")})`);
  if (body.split("\n").length > 500) warnings.push(`SKILL.md very long (${body.split("\n").length} lines) — consider splitting`);

  return { skill: name, errors, warnings, verdict: errors.length ? "FAIL" : warnings.length ? "WARN" : "PASS" };
}

/**
 * Every path a workflow case expects to be read must exist. The cases files import only a TYPE
 * from src/, so importing them here pulls in no vitest runtime.
 */
async function workflowPathErrors(): Promise<string[]> {
  const dir = join(EVALS_DIR, "workflow");
  if (!existsSync(dir)) return [];
  const errors: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".cases.ts")).sort()) {
    const mod: { cases?: WorkflowCase[] } = await import(pathToFileURL(join(dir, file)).href);
    for (const c of mod.cases ?? []) {
      const expected = c.kind === "contrast" ? [c.expectFileRead] : c.kind === "trace" ? (c.expectFilesRead ?? []) : [];
      for (const target of expected) {
        if (!existsSync(join(REPO_ROOT, target))) {
          errors.push(`${file} > "${c.name}" expects a read of '${target}', which does not exist`);
        }
      }
    }
  }
  return errors;
}

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const verdictColor = (v: Report["verdict"]) => (v === "FAIL" ? RED : v === "WARN" ? YELLOW : GREEN);

async function main() {
  const args = process.argv.slice(2);
  const dirs = args.length
    ? args.map((a) => (a.includes("/") ? a : join(SKILLS_DIR, a)))
    : readdirSync(SKILLS_DIR)
        .map((d) => join(SKILLS_DIR, d))
        .filter((d) => statSync(d).isDirectory() && existsSync(join(d, "SKILL.md")));

  let failures = 0;
  for (const d of dirs.sort()) {
    const r = evaluate(d);
    console.log(`\n${"=".repeat(56)}\n${r.skill}  [${verdictColor(r.verdict)}${r.verdict}${RESET}]\n${"=".repeat(56)}`);
    r.errors.forEach((e) => console.log(`  ${RED}ERROR: ${e}${RESET}`));
    r.warnings.forEach((w) => console.log(`  ${YELLOW}WARN:  ${w}${RESET}`));
    if (!r.errors.length && !r.warnings.length) console.log(`  ${GREEN}all checks passed.${RESET}`);
    if (r.verdict === "FAIL") failures++;
  }
  const pathErrors = await workflowPathErrors();
  console.log(`\n${"=".repeat(56)}\nworkflow case paths  [${pathErrors.length ? RED + "FAIL" : GREEN + "PASS"}${RESET}]\n${"=".repeat(56)}`);
  pathErrors.forEach((e) => console.log(`  ${RED}ERROR: ${e}${RESET}`));
  if (!pathErrors.length) console.log(`  ${GREEN}every expected read points at a file that exists.${RESET}`);
  failures += pathErrors.length;

  console.log(`\n${"=".repeat(56)}\nTotal: ${dirs.length} skills, ${failures} failures`);
  process.exit(failures ? 1 : 0);
}

await main();
