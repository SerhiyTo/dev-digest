"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { OnboardingView } from "@devdigest/shared";

const ONBOARDING_POLL_MS = 1500;

export function onboardingKey(repoId: string | null | undefined) {
  return ["onboarding", repoId] as const;
}

export function onboardingPollInterval(
  status: OnboardingView["status"] | undefined,
): number | false {
  return status === "running" ? ONBOARDING_POLL_MS : false;
}

export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: onboardingKey(repoId),
    queryFn: () => api.get<OnboardingView>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (query) => onboardingPollInterval(query.state.data?.status),
  });
}

export function useGenerateOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string }>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKey(repoId) }),
  });
}

export interface RepoFile {
  path: string;
  content: string;
  truncated?: boolean;
}

export function repoFileKey(repoId: string | null | undefined, path: string | null | undefined) {
  return ["repo-file", repoId, path] as const;
}

export function useRepoFile(repoId: string | null | undefined, path: string | null | undefined) {
  const query = useQuery({
    queryKey: repoFileKey(repoId, path),
    queryFn: () =>
      api.get<RepoFile>(`/repos/${repoId}/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
    retry: false,
  });
  return {
    ...query,
    isNotFound: query.error instanceof ApiError && query.error.status === 404,
  };
}
