import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * No-DB route smoke tests via app.inject(). `/health` and the validation/error
 * envelope don't touch the database (postgres-js connects lazily), so these run
 * without Docker. DB-backed routes are covered in integration.test.ts.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('routes (no DB)', () => {
  it('GET /health → ok', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('POST /settings/test-connection (github) returns structured ConnTestResult', async () => {
    const app = await buildApp({
      config,
      overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('github');
    expect(body.ok).toBe(true);
    expect(body.message).toContain('octocat');
    await app.close();
  });

  it('POST /settings/test-connection (openai) uses injected LLM listModels', async () => {
    const app = await buildApp({
      config,
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { models: [{ id: 'gpt-4.1', provider: 'openai' }] }) },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai' },
    });
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('registers the skills module in the route table', async () => {
    const app = await buildApp({ config });
    await app.ready();
    const routes = [
      { method: 'GET' as const, url: '/skills' },
      { method: 'GET' as const, url: '/skills/:id' },
      { method: 'POST' as const, url: '/skills' },
      { method: 'PUT' as const, url: '/skills/:id' },
      { method: 'DELETE' as const, url: '/skills/:id' },
      { method: 'GET' as const, url: '/skills/:id/stats' },
      { method: 'GET' as const, url: '/skills/:id/versions' },
      { method: 'GET' as const, url: '/skills/:id/versions/:version/diff' },
      { method: 'POST' as const, url: '/skills/:id/versions/:version/restore' },
    ];
    for (const route of routes) {
      expect(app.hasRoute(route), `${route.method} ${route.url}`).toBe(true);
    }
    await app.close();
  });

  it('registers the conventions module in the route table', async () => {
    const app = await buildApp({ config });
    await app.ready();
    const routes = [
      { method: 'GET' as const, url: '/repos/:id/conventions' },
      { method: 'POST' as const, url: '/repos/:id/conventions/scan' },
      { method: 'POST' as const, url: '/conventions/:id/accept' },
      { method: 'POST' as const, url: '/conventions/:id/reject' },
      { method: 'PATCH' as const, url: '/conventions/:id' },
      { method: 'POST' as const, url: '/repos/:id/conventions/status' },
      { method: 'GET' as const, url: '/repos/:id/conventions/skill-draft' },
      { method: 'POST' as const, url: '/repos/:id/conventions/skill' },
    ];
    for (const route of routes) {
      expect(app.hasRoute(route), `${route.method} ${route.url}`).toBe(true);
    }
    await app.close();
  });

  it('registers the smart-diff module in the route table', async () => {
    const app = await buildApp({ config });
    await app.ready();
    const route = { method: 'GET' as const, url: '/pulls/:id/smart-diff' };
    expect(app.hasRoute(route), `${route.method} ${route.url}`).toBe(true);
    await app.close();
  });

  it('registers the blast module in the route table', async () => {
    const app = await buildApp({ config });
    await app.ready();
    const route = { method: 'GET' as const, url: '/pulls/:id/blast-radius' };
    expect(app.hasRoute(route), `${route.method} ${route.url}`).toBe(true);
    await app.close();
  });

  it('rejects a non-uuid pull id on the smart-diff route', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('returns 422 structured error on invalid body', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'not-a-provider' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
