/* hooks/agent-skills.ts — React Query hooks for an agent's linked skills (order = prompt order). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentSkillLink } from "@devdigest/shared";

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", agentId, "skills"],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export function useSetAgentSkills(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent", agentId, "skills"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
