import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler, { isTrustedBrowserOrigin } from './completions.mjs';

test('Qwen proxy only accepts the published site and its own preview domain', () => {
  assert.equal(isTrustedBrowserOrigin('https://huhu-bli.github.io'), true);
  assert.equal(isTrustedBrowserOrigin('https://bfu-smart-travel.vercel.app'), true);
  assert.equal(
    isTrustedBrowserOrigin('https://bfu-smart-travel-git-fix-map-and-route-edit-h2642341596-4653.vercel.app'),
    true,
  );
  assert.equal(isTrustedBrowserOrigin('https://bfu-smart-travel-f3jw7fprq-h2642341596-4653.vercel.app'), true);
  assert.equal(isTrustedBrowserOrigin('http://localhost:5173'), true);
  assert.equal(isTrustedBrowserOrigin('https://another-project.vercel.app'), false);
  assert.equal(isTrustedBrowserOrigin('https://bfu-smart-travel-f3jw7fprq-foreign-team.vercel.app'), false);
  assert.equal(isTrustedBrowserOrigin('https://bfu-smart-travel-git-demo-foreign-team.vercel.app'), false);
  assert.equal(isTrustedBrowserOrigin('http://localhost:8080'), false);
});

function proxyRequest() {
  const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } };
  const req = { method: 'POST', headers: { origin: 'https://bfu-smart-travel.vercel.app' },
    body: { model: 'qwen3.8-flash', messages: [{ role: 'user', content: '测试' }] } };
  return { req, res };
}

function configureKey(t) {
  const previous = process.env.QWEN_API_KEY;
  process.env.QWEN_API_KEY = 'unit-test-key';
  t.after(() => { if (previous === undefined) delete process.env.QWEN_API_KEY; else process.env.QWEN_API_KEY = previous; });
}

test('Qwen timeout covers stalled response bodies after headers arrive', async (t) => {
  configureKey(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reading;
  const started = new Promise((resolve) => { reading = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url, options) => ({
    status: 200, headers: new Headers({ 'content-type': 'application/json' }),
    text: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      reading();
    }),
  }));
  const { req, res } = proxyRequest();
  const pending = handler(req, res);
  await started;
  t.mock.timers.tick(35_001);
  await pending;
  assert.equal(res.statusCode, 504);
  assert.match(res.body, /上游请求超时/);
  assert.doesNotMatch(res.body, /unit-test-key/);
});

test('Qwen response body failures return a controlled error without leaking upstream details', async (t) => {
  configureKey(t);
  t.mock.method(globalThis, 'fetch', async () => ({ text: async () => { throw new Error('private upstream detail'); } }));
  const { req, res } = proxyRequest();
  await handler(req, res);
  assert.equal(res.statusCode, 502);
  assert.doesNotMatch(res.body, /private upstream detail|unit-test-key/);
});

test('Qwen rejects invalid JSON and disallowed model before contacting upstream', async (t) => {
  configureKey(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call upstream'); });
  for (const body of ['{bad json', { model: 'arbitrary-expensive-model', messages: [{ role: 'user', content: 'test' }] }]) {
    const { req, res } = proxyRequest();
    req.body = body;
    await handler(req, res);
    assert.ok([400, 403].includes(res.statusCode));
  }
  assert.equal(fetch.mock.callCount(), 0);
});
