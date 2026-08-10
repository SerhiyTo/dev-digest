import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

export const prIntentKey = (prId: string | null | undefined) => ["pr-intent", prId] as const;

export function isNotComputed(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: prIntentKey(prId),
    queryFn: () => api.get<PrIntentRecord>(`/pulls/${prId}/intent`),
    enabled: prId != null,
    retry: false,
  });
}

export function useComputeIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent`, {}),
    onSuccess: (record) => {
      qc.setQueryData(prIntentKey(prId), record);
      void qc.invalidateQueries({ queryKey: prIntentKey(prId) });
    },
  });
}
