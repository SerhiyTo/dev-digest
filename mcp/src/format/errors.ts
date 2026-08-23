export interface ToolErrorResult {
  isError: boolean;
  text: string;
}

function ok(text: string): ToolErrorResult {
  return { isError: false, text };
}

function fail(text: string): ToolErrorResult {
  return { isError: true, text };
}

export function apiUnreachable(apiUrl: string): ToolErrorResult {
  return fail(
    `Cannot reach the DevDigest API at ${apiUrl}. Start it with 'cd server && pnpm dev', then call this tool again. If it runs elsewhere, set DEVDIGEST_API_URL.`,
  );
}

export function requestTimedOut(method: string, path: string, timeoutS: number): ToolErrorResult {
  return fail(
    `The DevDigest API did not answer ${method} ${path} within ${timeoutS}s. It may still be booting or syncing GitHub — wait a few seconds and call list_agents to check it is up.`,
  );
}

export function unknownRepo(ref: string, known: readonly string[]): ToolErrorResult {
  const knownList = known.length > 0 ? known.join(', ') : '(none imported yet)';
  return fail(
    `No repository matches "${ref}". Known: ${knownList}. Re-call with one of those, or add the repo in the DevDigest UI.`,
  );
}

export function ambiguousRepo(ref: string, matches: readonly string[]): ToolErrorResult {
  return fail(
    `Two repositories are named "${ref}": ${matches.join(', ')}. Re-call with the full owner/name form.`,
  );
}

export function unknownPr(repo: string, pr: number, known: readonly number[]): ToolErrorResult {
  const knownList = known.length > 0 ? known.join(', ') : '(none imported yet)';
  return fail(
    `Repository ${repo} has no pull request #${pr} imported. Imported: ${knownList}. Import it in the DevDigest UI, then re-call.`,
  );
}

export function prNotPersisted(repo: string, pr: number): ToolErrorResult {
  return fail(
    `Pull request #${pr} in ${repo} was found but has not been persisted yet. Open it once in the DevDigest UI, then re-call.`,
  );
}

export function unknownRunId(
  repo: string,
  pr: number,
  runId: string,
  known: readonly string[],
): ToolErrorResult {
  const knownList = known.length > 0 ? known.join(', ') : '(none yet)';
  return fail(
    `Pull request #${pr} in ${repo} has no run "${runId}". Known runs: ${knownList}. Omit run_id to get the newest finished run, or re-call with one of those.`,
  );
}

export function unknownAgent(name: string, closest?: string): ToolErrorResult {
  if (closest === undefined) {
    return fail(`No agent named "${name}". Call list_agents for the exact names.`);
  }
  return fail(
    `No agent named "${name}". Call list_agents for the exact names — the closest match is "${closest}".`,
  );
}

export function runStillRunning(runId: string): ToolErrorResult {
  return ok(
    JSON.stringify({
      status: 'running',
      run_id: runId,
      hint: 'call get_findings with the same run_id again in about 30s',
    }),
  );
}

export function runFailed(status: 'failed' | 'cancelled', error: string): ToolErrorResult {
  return ok(
    JSON.stringify({
      status,
      error,
      hint:
        'if the error mentions a key, set it in DevDigest Settings; note that restarting the API also marks in-flight runs failed. Then call run_agent_on_pr again.',
    }),
  );
}

export function waitBudgetExceeded(
  repo: string,
  pr: number,
  runId: string,
  waitedS: number,
): ToolErrorResult {
  return ok(
    JSON.stringify({
      status: 'running',
      waited_s: waitedS,
      next: `call get_findings(repo="${repo}", pr=${pr}, run_id="${runId}") in about a minute`,
    }),
  );
}

export function rateLimited(): ToolErrorResult {
  return fail(
    `The DevDigest API rate-limits review starts to 10 per minute and you have hit that limit. Wait about 60s — do not retry immediately.`,
  );
}

export function shapeMismatch(method: string, path: string, missingField: string): ToolErrorResult {
  return fail(
    `Got an unexpected shape from ${method} ${path} (missing: ${missingField}). The API and this MCP server are out of sync.`,
  );
}

export function httpError(
  method: string,
  path: string,
  status: number,
  bodySnippet: string,
): ToolErrorResult {
  return fail(
    `The DevDigest API returned ${status} for ${method} ${path}: ${bodySnippet}. Check the API logs.`,
  );
}

export function noRunsYet(repo: string, pr: number): ToolErrorResult {
  return ok(
    JSON.stringify({
      status: 'none',
      hint: `call run_agent_on_pr(repo="${repo}", pr=${pr}, agent="<a name from list_agents>")`,
    }),
  );
}

export function reviewStartedNoRun(agentName: string): ToolErrorResult {
  return fail(
    `The DevDigest API accepted the review request but started no run for agent "${agentName}" — it is probably disabled. Call list_agents and pick one with enabled:true.`,
  );
}
