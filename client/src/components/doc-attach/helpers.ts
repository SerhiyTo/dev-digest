import { ApiError } from "@/lib/api";
import type { DocAttachment, ProjectDoc } from "@/lib/types";

export interface AttachRow {
  path: string;
  name: string;
  folder: string;
  missing: boolean;
}

export function orderedAttachedPaths(attachments: readonly DocAttachment[]): string[] {
  return [...attachments].sort((a, b) => a.order - b.order).map((attachment) => attachment.path);
}

export function matchesFilter(name: string, description: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${name} ${description}`.toLowerCase().includes(q);
}

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) {
    return [...list];
  }
  const next = [...list];
  const item = next.splice(from, 1)[0] as T;
  next.splice(to, 0, item);
  return next;
}

export function fileName(path: string): string {
  return path.split("/").pop() || path;
}

export function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

export function attachedRows(
  paths: readonly string[],
  documents: readonly ProjectDoc[],
): AttachRow[] {
  const byPath = new Map(documents.map((doc) => [doc.path, doc]));
  return paths.map((path) => {
    const doc = byPath.get(path);
    return doc
      ? { path, name: doc.name, folder: doc.folder, missing: false }
      : { path, name: fileName(path), folder: folderOf(path), missing: true };
  });
}

export function unattachedDocs(
  documents: readonly ProjectDoc[],
  attachedPaths: readonly string[],
): ProjectDoc[] {
  const attached = new Set(attachedPaths);
  return documents.filter((doc) => !attached.has(doc.path));
}

export interface SaveErrorLabels {
  saveErrorLimit: (max: number) => string;
  saveErrorInvalidPath: string;
  saveErrorOwnerGone: string;
  saveErrorServer: string;
  saveErrorUnknown: (message: string) => string;
}

export function saveErrorText(
  error: unknown,
  maxAttachments: number,
  labels: SaveErrorLabels,
): string | null {
  if (error == null) return null;
  if (!(error instanceof ApiError)) {
    return labels.saveErrorUnknown(error instanceof Error ? error.message : String(error));
  }
  switch (error.code) {
    case "conflict":
      return labels.saveErrorLimit(maxAttachments);
    case "invalid_path":
      return labels.saveErrorInvalidPath;
    case "not_found":
      return labels.saveErrorOwnerGone;
    case "internal_error":
      return labels.saveErrorServer;
    default:
      return labels.saveErrorUnknown(error.message);
  }
}
