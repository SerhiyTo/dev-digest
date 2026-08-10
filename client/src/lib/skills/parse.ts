import { unzipSync } from "fflate";

export interface ParsedSkillMarkdown {
  name: string;
  description: string;
  body: string;
}

export const SKILL_ARCHIVE_MAX_ENTRIES = 200;
export const SKILL_ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
export const SKILL_ARCHIVE_MAX_ENTRY_UNCOMPRESSED_BYTES = 1024 * 1024;

export class SkillArchiveError extends Error {}

export interface ExtractedSkillArchive {
  markdown: string;
  entry: string;
  skipped: string[];
}

const FRONTMATTER_DELIMITER = "---";
const FRONTMATTER_FIELD = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;
const H1_HEADING = /^#(?!#)[ \t]+(.+)$/m;

export function parseSkillMarkdown(text: string): ParsedSkillMarkdown {
  const { fields, body } = splitFrontmatter(text);
  const h1 = H1_HEADING.exec(body)?.[1]?.trim() ?? "";
  return {
    name: fields.name || h1 || "",
    description: fields.description || "",
    body,
  };
}

function splitFrontmatter(text: string): { fields: Record<string, string>; body: string } {
  const lines = text.split(/\r\n|\n/);
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return { fields: {}, body: text.trim() };
  }
  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER,
  );
  if (closingIndex === -1) {
    return { fields: {}, body: text.trim() };
  }
  const fields = parseFrontmatterFields(lines.slice(1, closingIndex));
  const body = lines.slice(closingIndex + 1).join("\n").trim();
  return { fields, body };
}

function parseFrontmatterFields(lines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const match = FRONTMATTER_FIELD.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    fields[key!] = stripQuotes(rawValue!.trim());
  }
  return fields;
}

function stripQuotes(value: string): string {
  const first = value[0];
  const last = value[value.length - 1];
  const isQuoted = value.length >= 2 && first === last && (first === '"' || first === "'");
  return isQuoted ? value.slice(1, -1) : value;
}

export function extractSkillFromArchive(bytes: Uint8Array): ExtractedSkillArchive {
  const entries = collectEntryMetadata(bytes);
  const fileEntries = entries.filter((entry) => !entry.name.endsWith("/"));

  const winner = pickMarkdownEntry(fileEntries.map((entry) => entry.name));
  if (!winner) {
    throw new SkillArchiveError("Archive contains no markdown entry");
  }

  const skipped = fileEntries
    .map((entry) => entry.name)
    .filter((name) => name !== winner)
    .sort();

  const decompressed = unzipSync(bytes, { filter: (file) => file.name === winner });
  const markdownBytes = decompressed[winner];
  if (!markdownBytes) {
    throw new SkillArchiveError(`Failed to read archive entry "${winner}"`);
  }

  return { markdown: new TextDecoder().decode(markdownBytes), entry: winner, skipped };
}

function collectEntryMetadata(bytes: Uint8Array): { name: string; originalSize: number }[] {
  const entries: { name: string; originalSize: number }[] = [];
  let totalUncompressed = 0;

  unzipSync(bytes, {
    filter(file) {
      if (isUnsafeEntryPath(file.name)) {
        throw new SkillArchiveError(`Unsafe archive entry path: ${file.name}`);
      }
      if (entries.length + 1 > SKILL_ARCHIVE_MAX_ENTRIES) {
        throw new SkillArchiveError(
          `Archive exceeds the maximum of ${SKILL_ARCHIVE_MAX_ENTRIES} entries`,
        );
      }
      if (file.originalSize > SKILL_ARCHIVE_MAX_ENTRY_UNCOMPRESSED_BYTES) {
        throw new SkillArchiveError(
          `Archive entry "${file.name}" exceeds the ${SKILL_ARCHIVE_MAX_ENTRY_UNCOMPRESSED_BYTES}-byte single-entry limit`,
        );
      }
      totalUncompressed += file.originalSize;
      if (totalUncompressed > SKILL_ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new SkillArchiveError(
          `Archive exceeds the ${SKILL_ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES}-byte total uncompressed size limit`,
        );
      }
      entries.push({ name: file.name, originalSize: file.originalSize });
      return false;
    },
  });

  return entries;
}

function isUnsafeEntryPath(name: string): boolean {
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(name)) return true;
  return name.split(/[\\/]/).includes("..");
}

function pickMarkdownEntry(names: string[]): string | null {
  const markdownNames = names.filter((name) => name.toLowerCase().endsWith(".md")).sort();
  if (markdownNames.length === 0) return null;
  const skillMd = markdownNames.find((name) => {
    const base = name.split("/").pop() ?? name;
    return base.toLowerCase() === "skill.md";
  });
  return skillMd ?? markdownNames[0]!;
}
