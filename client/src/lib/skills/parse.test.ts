import { describe, it, expect } from "vitest";
import { zipSync } from "fflate";
import {
  parseSkillMarkdown,
  extractSkillFromArchive,
  SkillArchiveError,
  SKILL_ARCHIVE_MAX_ENTRIES,
  SKILL_ARCHIVE_MAX_ENTRY_UNCOMPRESSED_BYTES,
  SKILL_ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES,
} from "./parse";

const encode = (text: string) => new TextEncoder().encode(text);
const zip = (files: Record<string, string>) => {
  const zippable: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) zippable[path] = encode(content);
  return zipSync(zippable);
};

describe("parseSkillMarkdown", () => {
  it("reads name and description from frontmatter", () => {
    const text = ['---', 'name: My Skill', 'description: Does a thing', '---', '', '# My Skill', ''].join(
      "\n",
    );
    expect(parseSkillMarkdown(text)).toEqual({
      name: "My Skill",
      description: "Does a thing",
      body: "# My Skill",
    });
  });

  it("falls back to the first h1 when there is no frontmatter", () => {
    const result = parseSkillMarkdown("# Fallback Name\n\nSome body text.");
    expect(result.name).toBe("Fallback Name");
    expect(result.description).toBe("");
  });

  it("does not treat a mid-document --- rule as frontmatter", () => {
    const text = "# Title\n\nIntro text.\n\n---\n\nMore text after the rule.";
    const result = parseSkillMarkdown(text);
    expect(result.name).toBe("Title");
    expect(result.body).toBe(text.trim());
  });

  it("strips the frontmatter block from the body but keeps the h1", () => {
    const text = ["---", "name: X", "---", "", "# X", "", "Body content."].join("\n");
    const result = parseSkillMarkdown(text);
    expect(result.body.startsWith("# X")).toBe(true);
    expect(result.body).not.toContain("---");
  });

  it("falls back to an empty name and description when neither is present", () => {
    const result = parseSkillMarkdown("Just some text, no heading.");
    expect(result.name).toBe("");
    expect(result.description).toBe("");
  });

  it("supports quoted frontmatter values", () => {
    const text = ['---', 'name: "Quoted Name"', "description: 'Single quoted'", '---', 'Body'].join(
      "\n",
    );
    const result = parseSkillMarkdown(text);
    expect(result.name).toBe("Quoted Name");
    expect(result.description).toBe("Single quoted");
  });
});

describe("extractSkillFromArchive", () => {
  it("prefers SKILL.md over another markdown entry", () => {
    const bytes = zip({ "SKILL.md": "# Skill\nBody", "other.md": "# Other" });
    const result = extractSkillFromArchive(bytes);
    expect(result.entry).toBe("SKILL.md");
    expect(result.markdown).toContain("# Skill");
    expect(result.skipped).toEqual(["other.md"]);
  });

  it("matches SKILL.md case-insensitively at any depth", () => {
    const bytes = zip({ "docs/skill.md": "# Nested Skill", "top.md": "# Top" });
    const result = extractSkillFromArchive(bytes);
    expect(result.entry).toBe("docs/skill.md");
    expect(result.skipped).toEqual(["top.md"]);
  });

  it("picks the first .md entry in sorted order when there is no SKILL.md", () => {
    const bytes = zip({ "b.md": "# B", "a.md": "# A" });
    const result = extractSkillFromArchive(bytes);
    expect(result.entry).toBe("a.md");
    expect(result.markdown).toContain("# A");
    expect(result.skipped).toEqual(["b.md"]);
  });

  it("lists non-markdown entries as skipped and never surfaces their content", () => {
    const bytes = zip({ "SKILL.md": "# Skill", "notes.txt": "SECRET_SIDECAR_CONTENT" });
    const result = extractSkillFromArchive(bytes);
    expect(result.skipped).toEqual(["notes.txt"]);
    expect(result.markdown).not.toContain("SECRET_SIDECAR_CONTENT");
  });

  it("throws a distinguishable error when the archive has no markdown entry", () => {
    const bytes = zip({ "notes.txt": "no markdown here" });
    expect(() => extractSkillFromArchive(bytes)).toThrow(SkillArchiveError);
  });

  it("throws when the archive exceeds the maximum entry count", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i <= SKILL_ARCHIVE_MAX_ENTRIES; i++) files[`f${i}.md`] = "# F";
    const bytes = zip(files);
    expect(() => extractSkillFromArchive(bytes)).toThrow(SkillArchiveError);
  });

  it("throws when a single entry exceeds the per-entry uncompressed size limit", () => {
    const bytes = zip({
      "SKILL.md": "x".repeat(SKILL_ARCHIVE_MAX_ENTRY_UNCOMPRESSED_BYTES + 1),
    });
    expect(() => extractSkillFromArchive(bytes)).toThrow(SkillArchiveError);
  });

  it("throws when the total uncompressed size across entries exceeds the limit", () => {
    const perFile = Math.floor(SKILL_ARCHIVE_MAX_ENTRY_UNCOMPRESSED_BYTES * 0.9);
    const fileCount = Math.ceil(SKILL_ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES / perFile) + 1;
    const files: Record<string, string> = {};
    for (let i = 0; i < fileCount; i++) files[`f${i}.md`] = "x".repeat(perFile);
    const bytes = zip(files);
    expect(() => extractSkillFromArchive(bytes)).toThrow(SkillArchiveError);
  });

  it("rejects an entry path with a .. traversal segment instead of silently skipping it", () => {
    const bytes = zip({ "SKILL.md": "# Skill", "../evil.md": "# Evil" });
    expect(() => extractSkillFromArchive(bytes)).toThrow(SkillArchiveError);
  });

  it("rejects an absolute entry path", () => {
    const bytes = zip({ "SKILL.md": "# Skill", "/etc/evil.md": "# Evil" });
    expect(() => extractSkillFromArchive(bytes)).toThrow(SkillArchiveError);
  });

  it("rejects a backslash-absolute (UNC-style) entry path", () => {
    const bytes = zip({ "SKILL.md": "# Skill", "\\\\server\\share\\evil.md": "# Evil" });
    expect(() => extractSkillFromArchive(bytes)).toThrow(SkillArchiveError);
  });
});
