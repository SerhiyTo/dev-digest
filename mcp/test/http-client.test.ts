import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/config.js';
import { ApiError, createHttpApi } from '../src/http/client.js';
import type { DevDigestApi } from '../src/ports.js';

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function buildApi(env: NodeJS.ProcessEnv = {}): DevDigestApi {
  return createHttpApi(readConfig(env));
}

describe('createHttpApi', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses an additive unknown field via passthrough', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [
        {
          id: 'agent-1',
          name: 'General Reviewer',
          description: 'Broad pass',
          model: 'claude-sonnet-5',
          enabled: true,
          system_prompt: 'unused-by-mcp-but-present-on-the-wire',
        },
      ]),
    );

    const api = buildApi();
    const agents = await api.listAgents();

    expect(agents).toEqual([
      expect.objectContaining({ id: 'agent-1', name: 'General Reviewer', enabled: true }),
    ]);
  });

  it('maps a missing required field to kind: shape with the field name in detail', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [
        {
          id: 'agent-1',
          name: 'General Reviewer',
          description: 'Broad pass',
          model: 'claude-sonnet-5',
        },
      ]),
    );

    const api = buildApi();
    await expect(api.listAgents()).rejects.toMatchObject({
      kind: 'shape',
      detail: expect.stringContaining('enabled'),
    });
  });

  it('maps HTTP 429 to kind: rate_limited and captures retry-after', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: 'rate limited' }, { 'retry-after': '42' }),
    );

    const api = buildApi();
    await expect(api.listRepos()).rejects.toMatchObject({
      kind: 'rate_limited',
      status: 429,
      detail: '42',
    });
  });

  it('maps HTTP 500 to kind: http with status and body text', async () => {
    fetchMock.mockResolvedValueOnce(new Response('internal error: boom', { status: 500 }));

    const api = buildApi();
    await expect(api.listRepos()).rejects.toMatchObject({
      kind: 'http',
      status: 500,
      detail: expect.stringContaining('internal error: boom'),
    });
  });

  it('distinguishes a timeout abort from a caller-signal abort', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );

    const shortTimeoutConfig = { ...readConfig({}), requestTimeoutMs: 20 };
    const api = createHttpApi(shortTimeoutConfig);
    const timedOut = api.listAgents();
    let timeoutError: unknown;
    try {
      await timedOut;
    } catch (err) {
      timeoutError = err;
    }
    expect(timeoutError).toBeInstanceOf(ApiError);
    expect((timeoutError as ApiError).kind).toBe('timeout');

    const controller = new AbortController();
    const cancelled = api.listAgents(controller.signal);
    controller.abort();
    let cancelError: unknown;
    try {
      await cancelled;
    } catch (err) {
      cancelError = err;
    }
    expect(cancelError).not.toBeInstanceOf(ApiError);
    expect((cancelError as Error).name).toBe('AbortError');
  });

  it('maps a fetch rejection to kind: unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const api = buildApi();
    await expect(api.listRepos()).rejects.toMatchObject({
      kind: 'unreachable',
    });
  });

  it('uses the 30s timeout for listPulls and the 15s timeout for other calls', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, [])));

    const api = buildApi();
    await api.listPulls('repo-1');
    expect(timeoutSpy).toHaveBeenLastCalledWith(30_000);

    await api.listAgents();
    expect(timeoutSpy).toHaveBeenLastCalledWith(15_000);
  });

  it('posts {agentId} to /pulls/:prId/review and returns the started runs', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        pr_id: 'pr-1',
        runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security' }],
        reviews: [],
      }),
    );

    const api = buildApi();
    const runs = await api.startReview('pr-1', 'agent-1');

    expect(runs).toEqual([{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/pulls/pr-1/review');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ agentId: 'agent-1' });
  });
});
