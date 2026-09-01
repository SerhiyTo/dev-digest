export interface EvalCaseCleanup {
  deleteCasesForOwner(workspaceId: string, agentId: string): Promise<number>;
}
