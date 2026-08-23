/* hooks/context.ts — React Query hooks for L05 Project Context: the markdown
   documents discovered in a repository clone, the attachments binding them to
   an agent or a skill, and the server-side token estimate for a chosen set.

   Supersedes the dormant useContextFiles/useReindexContext that lived in
   hooks/core.ts against the SpecFile contract. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  DocAttachment,
  DocAttachmentInput,
  ProjectDocBody,
  ProjectDocList,
  TokenEstimate,
} from "../types";

export type DocOwnerKind = "agents" | "skills";

export function projectDocsKey(repoId: string | null | undefined) {
  return ["project-docs", repoId] as const;
}

export function projectDocKey(repoId: string | null | undefined, path: string | null | undefined) {
  return ["project-doc", repoId, path] as const;
}

export function docAttachmentsKey(
  ownerKind: DocOwnerKind,
  ownerId: string | null | undefined,
) {
  return ["doc-attachments", ownerKind, ownerId] as const;
}

export function tokenEstimateKey(repoId: string | null | undefined, paths: string[]) {
  return ["context-estimate", repoId, paths] as const;
}

// ---- Discovery (GET /repos/:id/context, POST /repos/:id/context/resync) ----

export function useProjectDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: projectDocsKey(repoId),
    queryFn: () => api.get<ProjectDocList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useResyncProjectContext(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ProjectDocList>(`/repos/${repoId}/context/resync`),
    onSuccess: (data) => {
      qc.setQueryData(projectDocsKey(repoId), data);
    },
  });
}

// ---- One document's body (GET /repos/:id/context/file) ----

export function useProjectDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: projectDocKey(repoId, path),
    queryFn: () =>
      api.get<ProjectDocBody>(
        `/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
    retry: false,
  });
}

// ---- Attachments (GET|PUT /(agents|skills)/:id/context) ----

export function useDocAttachments(ownerKind: DocOwnerKind, ownerId: string | null | undefined) {
  return useQuery({
    queryKey: docAttachmentsKey(ownerKind, ownerId),
    queryFn: () => api.get<DocAttachment[]>(`/${ownerKind}/${ownerId}/context`),
    enabled: !!ownerId,
  });
}

export function useSetDocAttachments(ownerKind: DocOwnerKind, ownerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => {
      const body: DocAttachmentInput = { paths };
      return api.put<DocAttachment[]>(`/${ownerKind}/${ownerId}/context`, body);
    },
    onSuccess: (data) => {
      qc.setQueryData(docAttachmentsKey(ownerKind, ownerId), data);
      qc.invalidateQueries({ queryKey: ["project-docs"] });
    },
  });
}

// ---- Token estimate (POST /repos/:id/context/estimate) ----

export function useTokenEstimate(repoId: string | null | undefined, paths: string[]) {
  return useQuery({
    queryKey: tokenEstimateKey(repoId, paths),
    queryFn: () => api.post<TokenEstimate>(`/repos/${repoId}/context/estimate`, { paths }),
    enabled: !!repoId,
  });
}
