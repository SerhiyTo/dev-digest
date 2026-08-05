import type { PrFile } from "@/lib/types";

export function toDiffFile(skillName: string, patch: string): PrFile {
  const additions = countLinesStartingWith(patch, "+");
  const deletions = countLinesStartingWith(patch, "-");
  return { path: `${skillName}.md`, additions, deletions, patch };
}

function countLinesStartingWith(patch: string, prefix: "+" | "-"): number {
  return patch.split("\n").filter((line) => line.startsWith(prefix)).length;
}
