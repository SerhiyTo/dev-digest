import { describe, expect, it } from 'vitest';
import {
  ambiguousRepo,
  apiUnreachable,
  httpError,
  noRunsYet,
  prNotPersisted,
  rateLimited,
  requestTimedOut,
  reviewStartedNoRun,
  runFailed,
  runStillRunning,
  shapeMismatch,
  unknownAgent,
  unknownPr,
  unknownRepo,
  unknownRunId,
  waitBudgetExceeded,
} from '../src/format/errors.js';

describe('error taxonomy', () => {
  it('row 1 — API unreachable', () => {
    const result = apiUnreachable('http://localhost:3001');
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"Cannot reach the DevDigest API at http://localhost:3001. Start it with 'cd server && pnpm dev', then call this tool again. If it runs elsewhere, set DEVDIGEST_API_URL."`,
    );
  });

  it('row 2 — request timed out', () => {
    const result = requestTimedOut('GET', '/repos', 15);
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"The DevDigest API did not answer GET /repos within 15s. It may still be booting or syncing GitHub — wait a few seconds and call list_agents to check it is up."`,
    );
  });

  it('row 3 — unknown repo', () => {
    const result = unknownRepo('foo/bar', ['acme/api', 'acme/web']);
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"No repository matches "foo/bar". Known: acme/api, acme/web. Re-call with one of those, or add the repo in the DevDigest UI."`,
    );
  });

  it('row 3b — ambiguous short repo name', () => {
    const result = ambiguousRepo('api', ['acme/api', 'other/api']);
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"Two repositories are named "api": acme/api, other/api. Re-call with the full owner/name form."`,
    );
  });

  it('row 4 — unknown PR number', () => {
    const result = unknownPr('acme/api', 99, [41, 42, 43]);
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"Repository acme/api has no pull request #99 imported. Imported: 41, 42, 43. Import it in the DevDigest UI, then re-call."`,
    );
  });

  it('row 4c — unknown run_id on a known PR', () => {
    const result = unknownRunId('acme/api', 42, 'deadbeef', ['9f1c2b7e-000', '9f1c2b7e-001']);
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"Pull request #42 in acme/api has no run "deadbeef". Known runs: 9f1c2b7e-000, 9f1c2b7e-001. Omit run_id to get the newest finished run, or re-call with one of those."`,
    );
  });

  it('row 4b — PR found but not persisted', () => {
    const result = prNotPersisted('acme/api', 42);
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"Pull request #42 in acme/api was found but has not been persisted yet. Open it once in the DevDigest UI, then re-call."`,
    );
  });

  it('row 5 — unknown agent name, with a closest match', () => {
    const result = unknownAgent('secrity', 'Security');
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"No agent named "secrity". Call list_agents for the exact names — the closest match is "Security"."`,
    );
  });

  it('row 5 — unknown agent name, with no close match', () => {
    const result = unknownAgent('zzzzzzz');
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"No agent named "zzzzzzz". Call list_agents for the exact names."`,
    );
  });

  it('row 6 — run still running', () => {
    const result = runStillRunning('9f1c2b7e-000');
    expect(result.isError).toBe(false);
    expect(result.text).toMatchInlineSnapshot(
      `"{"status":"running","run_id":"9f1c2b7e-000","hint":"call get_findings with the same run_id again in about 30s"}"`,
    );
  });

  it('row 7 — run failed', () => {
    const result = runFailed('failed', 'openrouter 401');
    expect(result.isError).toBe(false);
    expect(result.text).toMatchInlineSnapshot(
      `"{"status":"failed","error":"openrouter 401","hint":"if the error mentions a key, set it in DevDigest Settings; note that restarting the API also marks in-flight runs failed. Then call run_agent_on_pr again."}"`,
    );
  });

  it('row 7 — run cancelled', () => {
    const result = runFailed('cancelled', 'API restarted mid-run');
    expect(result.isError).toBe(false);
    expect(result.text).toMatchInlineSnapshot(
      `"{"status":"cancelled","error":"API restarted mid-run","hint":"if the error mentions a key, set it in DevDigest Settings; note that restarting the API also marks in-flight runs failed. Then call run_agent_on_pr again."}"`,
    );
  });

  it('row 8 — wait budget exceeded', () => {
    const result = waitBudgetExceeded('acme/api', 42, '9f1c2b7e-000', 180);
    expect(result.isError).toBe(false);
    expect(result.text).toMatchInlineSnapshot(
      `"{"status":"running","waited_s":180,"next":"call get_findings(repo=\\"acme/api\\", pr=42, run_id=\\"9f1c2b7e-000\\") in about a minute"}"`,
    );
  });

  it('row 9 — rate limited on review start', () => {
    const result = rateLimited();
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"The DevDigest API rate-limits review starts to 10 per minute and you have hit that limit. Wait about 60s — do not retry immediately."`,
    );
  });

  it('row 10 — response shape mismatch', () => {
    const result = shapeMismatch('GET', '/agents', 'name');
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"Got an unexpected shape from GET /agents (missing: name). The API and this MCP server are out of sync."`,
    );
  });

  it('row 11 — other 4xx/5xx', () => {
    const result = httpError('POST', '/pulls/123/review', 500, 'internal server error');
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"The DevDigest API returned 500 for POST /pulls/123/review: internal server error. Check the API logs."`,
    );
  });

  it('row 12 — no runs at all on this PR', () => {
    const result = noRunsYet('acme/api', 42);
    expect(result.isError).toBe(false);
    expect(result.text).toMatchInlineSnapshot(
      `"{"status":"none","hint":"call run_agent_on_pr(repo=\\"acme/api\\", pr=42, agent=\\"<a name from list_agents>\\")"}"`,
    );
  });

  it('row 13 — review accepted but started no run', () => {
    const result = reviewStartedNoRun('Security');
    expect(result.isError).toBe(true);
    expect(result.text).toMatchInlineSnapshot(
      `"The DevDigest API accepted the review request but started no run for agent "Security" — it is probably disabled. Call list_agents and pick one with enabled:true."`,
    );
  });

  it('rows 6, 7, 8 and 12 are isError:false — non-terminal states are answers, not failures', () => {
    expect(runStillRunning('r1').isError).toBe(false);
    expect(runFailed('failed', 'x').isError).toBe(false);
    expect(waitBudgetExceeded('acme/api', 1, 'r1', 180).isError).toBe(false);
    expect(noRunsYet('acme/api', 1).isError).toBe(false);
  });

  it('every other row is isError:true', () => {
    expect(apiUnreachable('http://localhost:3001').isError).toBe(true);
    expect(requestTimedOut('GET', '/repos', 15).isError).toBe(true);
    expect(unknownRepo('foo/bar', []).isError).toBe(true);
    expect(ambiguousRepo('api', ['a', 'b']).isError).toBe(true);
    expect(unknownPr('acme/api', 99, []).isError).toBe(true);
    expect(unknownRunId('acme/api', 42, 'deadbeef', []).isError).toBe(true);
    expect(prNotPersisted('acme/api', 42).isError).toBe(true);
    expect(unknownAgent('secrity').isError).toBe(true);
    expect(rateLimited().isError).toBe(true);
    expect(shapeMismatch('GET', '/agents', 'name').isError).toBe(true);
    expect(httpError('POST', '/x', 500, 'boom').isError).toBe(true);
    expect(reviewStartedNoRun('Security').isError).toBe(true);
  });
});
