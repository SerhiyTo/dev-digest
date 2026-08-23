import type { ProjectDoc, ProjectDocCategory } from "@/lib/types";
import { CATEGORY_ORDER } from "./constants";

export interface DocGroup {
  category: ProjectDocCategory;
  documents: ProjectDoc[];
}

export function matchesFilter(doc: ProjectDoc, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return doc.path.toLowerCase().includes(needle) || doc.name.toLowerCase().includes(needle);
}

export function filterDocs(documents: ProjectDoc[], query: string): ProjectDoc[] {
  return documents.filter((doc) => matchesFilter(doc, query));
}

export function groupByCategory(documents: ProjectDoc[]): DocGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    documents: documents.filter((doc) => doc.category === category),
  })).filter((group) => group.documents.length > 0);
}

export function repoLabel(fullName: string | null | undefined, fallback: string): string {
  if (!fullName) return fallback;
  return fullName.split("/").pop() || fallback;
}
