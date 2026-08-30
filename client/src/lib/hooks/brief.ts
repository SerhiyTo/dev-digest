import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse, PrBriefGenerationState } from "@devdigest/shared";

const BRIEF_POLL_MS = 1500;

export function briefKey(prId: string | null | undefined) {
  return ["pr-brief", prId] as const;
}

export function briefPollInterval(
  status: PrBriefGenerationState["status"] | undefined,
): number | false {
  return status === "running" ? BRIEF_POLL_MS : false;
}

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: prId != null,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (query) => briefPollInterval(query.state.data?.generation?.status),
  });
}

export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief/generate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: briefKey(prId) }),
  });
}
