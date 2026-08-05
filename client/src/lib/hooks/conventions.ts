/* hooks/conventions.ts — React Query hooks for the Conventions page.

   One query key holds the whole page (scan state + candidates); every mutation
   invalidates it. The scan is a background job, so the query polls itself only
   while the server reports a run in flight. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionSkillDraft,
  ConventionStatus,
  ConventionsView,
  Skill,
  SkillType,
} from "@devdigest/shared";

const SCAN_POLL_MS = 1500;

function conventionsKey(repoId: string | null | undefined) {
  return ["conventions", repoId] as const;
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionsKey(repoId),
    queryFn: () => api.get<ConventionsView>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (query) =>
      query.state.data?.state.status === "running" ? SCAN_POLL_MS : false,
  });
}

export interface ScanConventionsInput {
  path_prefix?: string;
}

export function useScanConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ScanConventionsInput = {}) =>
      api.post<{ status: string; jobId: string }>(`/repos/${repoId}/conventions/scan`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionsKey(repoId) }),
  });
}

export interface ConventionActionInput {
  id: string;
  action: "accept" | "reject";
}

export function useConventionAction(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: ConventionActionInput) =>
      api.post<{ convention: ConventionCandidate }>(`/conventions/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionsKey(repoId) }),
  });
}

export interface UpdateConventionInput {
  id: string;
  rule: string;
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rule }: UpdateConventionInput) =>
      api.patch<{ convention: ConventionCandidate }>(`/conventions/${id}`, { rule }),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionsKey(repoId) }),
  });
}

export interface SetConventionStatusesInput {
  ids: string[];
  status: ConventionStatus;
}

export function useSetConventionStatuses(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetConventionStatusesInput) =>
      api.post<{ conventions: ConventionCandidate[] }>(
        `/repos/${repoId}/conventions/status`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionsKey(repoId) }),
  });
}

/** Generated from the accepted rows, so it is fetched only once the modal opens. */
export function useConventionSkillDraft(repoId: string | null | undefined, open: boolean) {
  return useQuery({
    queryKey: [...conventionsKey(repoId), "skill-draft"],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled: !!repoId && open,
    staleTime: 0,
  });
}

export interface CreateSkillFromConventionsInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  skill_id?: string;
}

export function useCreateSkillFromConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: conventionsKey(repoId) });
    },
  });
}
