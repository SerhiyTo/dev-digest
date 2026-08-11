import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

export const prSmartDiffKey = (prId: string | null | undefined) =>
  ["pr-smart-diff", prId] as const;

export function usePrSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: prSmartDiffKey(prId),
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: prId != null,
    retry: false,
  });
}
