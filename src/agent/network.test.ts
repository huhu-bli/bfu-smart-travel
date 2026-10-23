import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AGENT_SETTINGS, PROXY_TIMEOUT_MS } from './config';
import { AgentHttpError, isRecoverableAgentFailure } from './errors';
import { probeConnection, requestModel } from './network';

test('model deadline remains active while response JSON is stalled after headers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started!: () => void;
  const reading = new Promise<void>((resolve) => { started = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => ({
    status: 200, ok: true, json: () => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      started();
    }),
  }));
  const pending = requestModel(DEFAULT_AGENT_SETTINGS, {});
  await reading;
  t.mock.timers.tick(PROXY_TIMEOUT_MS + 1);
  await assert.rejects(pending, (error: unknown) => error instanceof AgentHttpError && error.status === 504 && isRecoverableAgentFailure(error));
});

test('malformed successful responses are recoverable failures; authorization and quota errors keep their status', async (t) => {
  for (const body of ['<html>gateway</html>', 'null', '[]', '42']) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(body));
    await assert.rejects(requestModel(DEFAULT_AGENT_SETTINGS, {}), (e: unknown) => e instanceof AgentHttpError && e.status === 502);
    mock.mock.restore();
  }
  for (const status of [401, 403, 429]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response('not JSON', { status }));
    await assert.rejects(requestModel(DEFAULT_AGENT_SETTINGS, {}), (e: unknown) => e instanceof AgentHttpError && e.status === status && !isRecoverableAgentFailure(e));
    mock.mock.restore();
  }
});

test('health checks use the actual chat health endpoint and reject successful HTML fallback pages', async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    return urls.length === 1 ? new Response(JSON.stringify({ ok: true })) : new Response('<html>not an API</html>');
  });
  assert.equal((await probeConnection({ ...DEFAULT_AGENT_SETTINGS, proxyUrl: 'https://example.com/api/' })).ok, true);
  assert.equal(urls[0], 'https://example.com/api/chat/completions');
  assert.equal((await probeConnection(DEFAULT_AGENT_SETTINGS)).ok, false);
});

test('a health response body timeout returns a controlled result instead of rejecting or hanging', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started!: () => void;
  const reading = new Promise<void>((resolve) => { started = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => ({
    status: 503, ok: false, json: () => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      started();
    }),
  }));
  const pending = probeConnection(DEFAULT_AGENT_SETTINGS);
  await reading;
  t.mock.timers.tick(15001);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.message, /超时/);
});
