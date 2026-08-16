import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

export const prBlastKey = (prId: string | null | undefined) => ["pr-blast", prId] as const;

export function usePrBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBlastKey(prId),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast-radius`),
    enabled: prId != null,
    retry: false,
    staleTime: 60_000,
  });
}
