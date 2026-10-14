import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './amap-proxy.mjs';

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}

function request(path, headers = { origin: 'https://huhu-bli.github.io' }) {
  return {
    method: 'GET',
    url: `/api/amap-proxy?amap_path=${encodeURIComponent(path)}&key=public-map-key&jscode=forged`,
    query: { amap_path: path },
    headers,
  };
}

test('map proxy appends the server secret and fixes the upstream host', async () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.AMAP_SECURITY_CODE;
  process.env.AMAP_SECURITY_CODE = 'server-only-test-secret';
  let target;
  globalThis.fetch = async (url) => {
    target = new URL(url);
    return new Response('{"status":"1"}', { headers: { 'content-type': 'application/json' } });
  };
  try {
    const res = response();
    await handler(request('v3/place/text'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['access-control-allow-origin'], 'https://huhu-bli.github.io');
    assert.equal(target.origin, 'https://restapi.amap.com');
    assert.equal(target.pathname, '/v3/place/text');
    assert.equal(target.searchParams.get('jscode'), 'server-only-test-secret');
    assert.equal(target.searchParams.getAll('jscode').length, 1);
    assert.equal(String(res.body).includes('server-only-test-secret'), false);

    const style = response();
    await handler(request('v4/map/styles'), style);
    assert.equal(target.origin, 'https://webapi.amap.com');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.AMAP_SECURITY_CODE;
    else process.env.AMAP_SECURITY_CODE = originalSecret;
  }
});

test('map proxy rejects foreign sites and unrelated paths before upstream', async () => {
  const originalSecret = process.env.AMAP_SECURITY_CODE;
  process.env.AMAP_SECURITY_CODE = 'server-only-test-secret';
  try {
    const foreign = response();
    await handler(request('v3/place/text', { origin: 'https://untrusted.example' }), foreign);
    assert.equal(foreign.statusCode, 403);

    const unwanted = response();
    await handler(request('v3/assistant/inputtips'), unwanted);
    assert.equal(unwanted.statusCode, 400);
    const traversal = response();
    await handler(request('v3/place/../../v3/place/text'), traversal);
    assert.equal(traversal.statusCode, 400);
  } finally {
    if (originalSecret === undefined) delete process.env.AMAP_SECURITY_CODE;
    else process.env.AMAP_SECURITY_CODE = originalSecret;
  }
});

test('map proxy fails closed when the server secret is missing', async () => {
  const originalSecret = process.env.AMAP_SECURITY_CODE;
  delete process.env.AMAP_SECURITY_CODE;
  try {
    const res = response();
    await handler(request('v3/place/text'), res);
    assert.equal(res.statusCode, 503);
  } finally {
    if (originalSecret !== undefined) process.env.AMAP_SECURITY_CODE = originalSecret;
  }
});
