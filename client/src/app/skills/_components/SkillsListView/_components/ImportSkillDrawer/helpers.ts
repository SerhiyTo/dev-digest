import { extractSkillFromArchive, parseSkillMarkdown } from "../../../../../../lib/skills";

export type ImportKind = "md" | "zip";

export interface ParsedSkillImport {
  name: string;
  description: string;
  body: string;
  skipped: string[];
}

export function detectImportKind(fileName: string): ImportKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".md")) return "md";
  return null;
}

export async function parseSkillFile(file: File): Promise<ParsedSkillImport> {
  const kind = detectImportKind(file.name);
  if (kind === "zip") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const archive = extractSkillFromArchive(bytes);
    const parsed = parseSkillMarkdown(archive.markdown);
    return { ...parsed, skipped: archive.skipped };
  }
  if (kind === "md") {
    const text = await file.text();
    const parsed = parseSkillMarkdown(text);
    return { ...parsed, skipped: [] };
  }
  throw new Error(`Unsupported file type: "${file.name}". Choose a .md or .zip file.`);
}
