import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Config } from '../src/config.js';
import { MAX_PAYLOAD_CHARS, POLL_FAST_MS, TOOL_ORDER } from '../src/constants.js';
import { INSTRUCTIONS } from '../src/instructions.js';
import { createServer } from '../src/server.js';
import {
  buildAgent,
  buildManyFindings,
  buildPull,
  buildRepo,
  buildReview,
  FakeDevDigestApi,
} from './helpers/fake-api.js';

interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

function makeClock(start = 0): Clock {
  let time = start;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiUrl: 'http://localhost:3001',
    requestTimeoutMs: 15_000,
    pullsTimeoutMs: 30_000,
    waitBudgetMs: 180_000,
    cacheTtlMs: 60_000,
    ...overrides,
  };
}

interface Harness {
  api: FakeDevDigestApi;
  client: Client;
  server: McpServer;
  clock: Clock;
  progressNotifications: unknown[];
}

async function setup(configOverrides: Partial<Config> = {}): Promise<Harness> {
  const api = new FakeDevDigestApi();
  const config = makeConfig(configOverrides);
  const clock = makeClock();
  const server = createServer({ api, config, now: clock.now, sleep: clock.sleep });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const progressNotifications: unknown[] = [];
  const originalOnMessage = clientTransport.onmessage;
  clientTransport.onmessage = (message, extra) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'method' in message &&
      (message as { method?: unknown }).method === 'notifications/progress'
    ) {
      progressNotifications.push(message);
    }
    originalOnMessage?.(message, extra);
  };

  return { api, client, server, clock, progressNotifications };
}

async function teardown(harness: Harness): Promise<void> {
  await harness.client.close();
  await harness.server.close();
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

async function callTool(
  harness: Harness,
  name: string,
  args: Record<string, unknown>,
  options?: RequestOptions,
): Promise<ToolCallResult> {
  const result = await harness.client.callTool({ name, arguments: args }, undefined, options);
  if (!('content' in result)) {
    throw new Error(`tool ${name} returned a task result, expected content`);
  }
  return result as ToolCallResult;
}

function soleText(result: ToolCallResult): string {
  expect(result.content).toHaveLength(1);
  const [block] = result.content;
  expect(block?.type).toBe('text');
  return block?.text ?? '';
}

describe('mcp-integration', () => {
  const harnesses: Harness[] = [];

  async function harness(configOverrides: Partial<Config> = {}): Promise<Harness> {
    const created = await setup(configOverrides);
    harnesses.push(created);
    return created;
  }

  afterEach(async () => {
    while (harnesses.length > 0) {
      const created = harnesses.pop();
      if (created !== undefined) await teardown(created);
    }
  });

  it('lists the five tools in TOOL_ORDER, none carrying an outputSchema', async () => {
    const h = await harness();

    const { tools } = await h.client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([...TOOL_ORDER]);
    for (const tool of tools) {
      expect(tool.outputSchema).toBeUndefined();
    }
  });

  it("exposes the server's instructions to the client unchanged", async () => {
    const h = await harness();

    expect(h.client.getInstructions()).toBe(INSTRUCTIONS);
  });

  it('run_agent_on_pr happy path returns one text block whose JSON carries verdict, score, run_id and findings', async () => {
    const h = await harness();
    const repo = buildRepo();
    const pull = buildPull();
    const agent = buildAgent();
    h.api.seedRepos([repo]);
    h.api.seedPulls(repo.id, [pull]);
    h.api.seedAgents([agent]);
    const runId = h.api.scriptRun(pull.id!, {
      agentId: agent.id,
      agentName: agent.name,
      behavior: { kind: 'done', afterPolls: 1 },
    });
    h.api.seedReview(
      pull.id!,
      buildReview({ run_id: runId, verdict: 'request_changes', score: 38 }),
    );

    const result = await callTool(h, 'run_agent_on_pr', {
      repo: repo.full_name,
      pr: pull.number,
      agent: agent.name,
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(soleText(result));
    expect(parsed).toMatchObject({ verdict: 'request_changes', score: 38, run_id: runId });
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);
  });

  it('a run scripted never to finish falls back to the wait-budget message naming get_findings, isError:false', async () => {
    const h = await harness({ waitBudgetMs: POLL_FAST_MS * 2 });
    const repo = buildRepo();
    const pull = buildPull();
    const agent = buildAgent();
    h.api.seedRepos([repo]);
    h.api.seedPulls(repo.id, [pull]);
    h.api.seedAgents([agent]);
    const runId = h.api.scriptRun(pull.id!, {
      agentId: agent.id,
      agentName: agent.name,
      behavior: { kind: 'never' },
    });

    const result = await callTool(h, 'run_agent_on_pr', {
      repo: repo.full_name,
      pr: pull.number,
      agent: agent.name,
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(soleText(result));
    expect(parsed.status).toBe('running');
    expect(parsed.next).toContain('get_findings');
    expect(parsed.next).toContain(runId);
  });

  it('an unknown agent name is rejected with isError:true and points to list_agents', async () => {
    const h = await harness();
    const repo = buildRepo();
    const pull = buildPull();
    h.api.seedRepos([repo]);
    h.api.seedPulls(repo.id, [pull]);
    h.api.seedAgents([buildAgent()]);

    const result = await callTool(h, 'run_agent_on_pr', {
      repo: repo.full_name,
      pr: pull.number,
      agent: 'Nonexistent',
    });

    expect(result.isError).toBe(true);
    expect(soleText(result)).toContain('list_agents');
  });

  it('sends progress notifications only when a progress token accompanies the call', async () => {
    const h = await harness();
    const repo = buildRepo();
    const pull = buildPull();
    const agent = buildAgent();
    h.api.seedRepos([repo]);
    h.api.seedPulls(repo.id, [pull]);
    h.api.seedAgents([agent]);

    const runId1 = h.api.scriptRun(pull.id!, {
      agentId: agent.id,
      agentName: agent.name,
      behavior: { kind: 'done', afterPolls: 3 },
    });
    h.api.seedReview(pull.id!, buildReview({ run_id: runId1 }));

    const progressUpdates: unknown[] = [];
    await callTool(
      h,
      'run_agent_on_pr',
      { repo: repo.full_name, pr: pull.number, agent: agent.name },
      { onprogress: (progress) => progressUpdates.push(progress) },
    );

    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(h.progressNotifications.length).toBeGreaterThan(0);
    const afterFirstCall = h.progressNotifications.length;

    const runId2 = h.api.scriptRun(pull.id!, {
      agentId: agent.id,
      agentName: agent.name,
      behavior: { kind: 'done', afterPolls: 3 },
    });
    h.api.seedReview(pull.id!, buildReview({ run_id: runId2 }));

    await callTool(h, 'run_agent_on_pr', {
      repo: repo.full_name,
      pr: pull.number,
      agent: agent.name,
    });

    expect(h.progressNotifications.length).toBe(afterFirstCall);
  });

  it('caps a large findings payload at MAX_PAYLOAD_CHARS while staying valid JSON, and marks it truncated', async () => {
    const h = await harness();
    const repo = buildRepo();
    const pull = buildPull();
    const agent = buildAgent();
    h.api.seedRepos([repo]);
    h.api.seedPulls(repo.id, [pull]);
    h.api.seedAgents([agent]);
    const runId = h.api.scriptRun(pull.id!, {
      agentId: agent.id,
      agentName: agent.name,
      behavior: { kind: 'done', afterPolls: 1 },
    });
    const findings = buildManyFindings(50, (i) => ({
      title: `Finding number ${i}: ${'x'.repeat(300)}`,
    }));
    h.api.seedReview(pull.id!, buildReview({ run_id: runId, findings }));

    const result = await callTool(h, 'run_agent_on_pr', {
      repo: repo.full_name,
      pr: pull.number,
      agent: agent.name,
      limit: 50,
    });

    expect(result.isError).toBe(false);
    const text = soleText(result);
    expect(text.length).toBeLessThanOrEqual(MAX_PAYLOAD_CHARS);
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text);
    expect(parsed.truncated).toBeDefined();
    expect(parsed.truncated.total).toBe(50);
  });

  it('get_blast_radius returns a degraded stub echoing repo/pr, isError:false, and makes zero API calls', async () => {
    const h = await harness();

    const result = await callTool(h, 'get_blast_radius', { repo: 'acme/api', pr: 42 });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(soleText(result));
    expect(parsed).toMatchObject({
      repo: 'acme/api',
      pr: 42,
      degraded: true,
      reason: 'not_implemented',
    });
    expect(Object.values(h.api.calls).every((count) => count === 0)).toBe(true);
  });

  it('get_findings with a run_id that does not exist is rejected with isError:true', async () => {
    const h = await harness();
    const repo = buildRepo();
    const pull = buildPull();
    const agent = buildAgent();
    h.api.seedRepos([repo]);
    h.api.seedPulls(repo.id, [pull]);
    h.api.seedAgents([agent]);
    h.api.scriptRun(pull.id!, {
      agentId: agent.id,
      agentName: agent.name,
      behavior: { kind: 'done', afterPolls: 1 },
    });
    await h.api.startReview(pull.id!, agent.id);

    const result = await callTool(h, 'get_findings', {
      repo: repo.full_name,
      pr: pull.number,
      run_id: 'does-not-exist',
    });

    expect(result.isError).toBe(true);
  });

  it('rejects a wrong-typed argument before it ever reaches the tool handler', async () => {
    const h = await harness();

    const result = await callTool(h, 'run_agent_on_pr', {
      repo: 'acme/api',
      pr: 'forty-two',
      agent: 'Security',
    });

    expect(result.isError).toBe(true);
    expect(soleText(result)).toContain('Invalid arguments for tool run_agent_on_pr');
    expect(Object.values(h.api.calls).every((count) => count === 0)).toBe(true);
  });
});
