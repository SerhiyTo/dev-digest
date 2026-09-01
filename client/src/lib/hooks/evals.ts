"use client";

import { useCallback } from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  EvalCaseInput,
  EvalCaseRecord,
  EvalCompare,
  EvalDashboard,
  EvalRunRecord,
  EvalRunResult,
  EvalSuiteRunRecord,
} from "@devdigest/shared";

const EVAL_RUN_POLL_MS = 4000;

export function evalDashboardsKey() {
  return ["eval-dashboards"] as const;
}

export function evalDashboardKey(agentId: string | null | undefined) {
  return ["eval-dashboard", agentId] as const;
}

export function evalCasesKey(agentId: string | null | undefined) {
  return ["eval-cases", agentId] as const;
}

export function evalCaseKey(caseId: string | null | undefined) {
  return ["eval-case", caseId] as const;
}

export function evalSuiteRunsKey(agentId: string | null | undefined) {
  return ["eval-suite-runs", agentId] as const;
}

export function evalSuiteRunKey(suiteRunId: string | null | undefined) {
  return ["eval-suite-run", suiteRunId] as const;
}

export function evalCompareKey(
  agentId: string | null | undefined,
  runIdA: string | null | undefined,
  runIdB: string | null | undefined,
) {
  return ["eval-compare", agentId, runIdA, runIdB] as const;
}

function invalidateEvalCaseQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["eval-cases"] });
  qc.invalidateQueries({ queryKey: ["eval-case"] });
}

function invalidateEvalRunQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["eval-suite-runs"] });
  qc.invalidateQueries({ queryKey: ["eval-suite-run"] });
  qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
  qc.invalidateQueries({ queryKey: ["eval-dashboards"] });
}

export interface EvalErrorLabels {
  notFound: string;
  validation: string;
  conflict: string;
  server: string;
  network: string;
  unknown: (message: string) => string;
}

export function evalErrorText(error: unknown, labels: EvalErrorLabels): string | null {
  if (error == null) return null;
  if (!(error instanceof ApiError)) {
    return labels.unknown(error instanceof Error ? error.message : String(error));
  }
  switch (error.code) {
    case "not_found":
      return labels.notFound;
    case "validation_error":
      return labels.validation;
    case "conflict":
      return labels.conflict;
    case "internal_error":
      return labels.server;
    case "network_error":
      return labels.network;
    default:
      return labels.unknown(error.message);
  }
}

export function useEvalDashboards() {
  return useQuery({
    queryKey: evalDashboardsKey(),
    queryFn: () => api.get<{ dashboards: EvalDashboard[] }>("/evals"),
  });
}

export function useEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalDashboardKey(agentId),
    queryFn: () => api.get<EvalDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
  });
}

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalCasesKey(agentId),
    queryFn: () => api.get<{ cases: EvalCaseRecord[] }>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useEvalCase(caseId: string | null | undefined) {
  return useQuery({
    queryKey: evalCaseKey(caseId),
    queryFn: () => api.get<EvalCaseRecord>(`/eval-cases/${caseId}`),
    enabled: !!caseId,
  });
}

export type EvalCaseBody = Omit<EvalCaseInput, "owner_kind" | "owner_id">;

export interface CreateEvalCaseInput {
  agentId: string;
  body: EvalCaseBody;
}

export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, body }: CreateEvalCaseInput) =>
      api.post<EvalCaseRecord>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: (data) => {
      qc.setQueryData(evalCaseKey(data.id), data);
      invalidateEvalCaseQueries(qc);
    },
  });
}

export interface UpdateEvalCaseInput {
  id: string;
  patch: Partial<EvalCaseBody>;
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseInput) =>
      api.patch<EvalCaseRecord>(`/eval-cases/${id}`, patch),
    onSuccess: (data) => {
      qc.setQueryData(evalCaseKey(data.id), data);
      invalidateEvalCaseQueries(qc);
    },
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: evalCaseKey(id) });
      invalidateEvalCaseQueries(qc);
    },
  });
}

export interface CreateEvalCaseFromFindingResult {
  case: EvalCaseRecord;
  created: boolean;
}

export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) =>
      api.post<CreateEvalCaseFromFindingResult>(`/findings/${findingId}/eval-case`),
    onSuccess: (data) => {
      qc.setQueryData(evalCaseKey(data.case.id), data.case);
      invalidateEvalCaseQueries(qc);
    },
  });
}

export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalRunResult>(`/eval-cases/${caseId}/run`),
    onSuccess: (_data, caseId) => {
      qc.invalidateQueries({ queryKey: evalCaseKey(caseId) });
      invalidateEvalCaseQueries(qc);
    },
  });
}

export function useEvalSuiteRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalSuiteRunsKey(agentId),
    queryFn: () => api.get<{ runs: EvalSuiteRunRecord[] }>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (query) =>
      (query.state.data?.runs ?? []).some((r) => r.status === "running")
        ? EVAL_RUN_POLL_MS
        : false,
  });
}

export interface AgentSuiteRuns {
  agentId: string;
  runs: EvalSuiteRunRecord[];
}

export function useEvalSuiteRunsForAgents(agentIds: string[]) {
  const combine = useCallback(
    (results: UseQueryResult<{ runs: EvalSuiteRunRecord[] }>[]) => ({
      data: results.map((result, i) => ({
        agentId: agentIds[i]!,
        runs: result.data?.runs ?? [],
      })) satisfies AgentSuiteRuns[],
      isLoading: results.some((result) => result.isLoading),
      isError: results.some((result) => result.isError),
      refetch: () => results.forEach((result) => result.refetch()),
    }),
    [agentIds],
  );

  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: evalSuiteRunsKey(agentId),
      queryFn: () => api.get<{ runs: EvalSuiteRunRecord[] }>(`/agents/${agentId}/eval-runs`),
    })),
    combine,
  });
}

export function useEvalSuiteRun(suiteRunId: string | null | undefined) {
  return useQuery({
    queryKey: evalSuiteRunKey(suiteRunId),
    queryFn: () =>
      api.get<{ suite_run: EvalSuiteRunRecord; runs: EvalRunRecord[] }>(
        `/eval-suite-runs/${suiteRunId}`,
      ),
    enabled: !!suiteRunId,
    refetchInterval: (query) =>
      query.state.data?.suite_run.status === "running" ? EVAL_RUN_POLL_MS : false,
  });
}

export function useStartEvalSuiteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      api.post<EvalSuiteRunRecord>(`/agents/${agentId}/eval-runs/start`),
    onSuccess: (data) => {
      qc.setQueryData(evalSuiteRunKey(data.id), { suite_run: data, runs: [] });
      invalidateEvalRunQueries(qc);
    },
  });
}

export function useCancelEvalSuiteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suiteRunId: string) =>
      api.post<{ ok: boolean }>(`/eval-suite-runs/${suiteRunId}/cancel`),
    onSuccess: (_data, suiteRunId) => {
      qc.invalidateQueries({ queryKey: evalSuiteRunKey(suiteRunId) });
      invalidateEvalRunQueries(qc);
    },
  });
}

export function useEvalCompare(
  agentId: string | null | undefined,
  runIdA: string | null | undefined,
  runIdB: string | null | undefined,
) {
  return useQuery({
    queryKey: evalCompareKey(agentId, runIdA, runIdB),
    queryFn: () =>
      api.get<EvalCompare>(
        `/agents/${agentId}/eval-runs/compare?a=${encodeURIComponent(runIdA ?? "")}&b=${encodeURIComponent(runIdB ?? "")}`,
      ),
    enabled: !!agentId && !!runIdA && !!runIdB,
  });
}
