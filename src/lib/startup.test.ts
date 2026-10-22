import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const bootScript = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const swScript = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

test('a failed module and a later React crash both reveal recovery, while successful startup hides it', () => {
  const events: Record<string, (event?: unknown) => void> = {};
  const elements: Record<string, any> = {
    'startup-status': { hidden: false }, 'startup-message': {},
    'startup-retry': { addEventListener: () => {} },
  };
  let timeout: () => void = () => {};
  const window = { addEventListener: (name: string, cb: () => void) => { events[name] = cb; },
    setTimeout: (cb: () => void) => { timeout = cb; }, clearTimeout: () => {} };
  runInNewContext(bootScript, { window, document: { getElementById: (id: string) => elements[id] } });
  events.error({ target: { tagName: 'SCRIPT' } });
  assert.match(elements['startup-message'].textContent, /未能完成加载/);
  events['bfu:ready']();
  assert.equal(elements['startup-status'].hidden, true);
  timeout();
  assert.equal(elements['startup-status'].hidden, true);
  events.error({ target: { tagName: 'IMG' } });
  assert.equal(elements['startup-status'].hidden, true);
  events['bfu:startup-error']();
  assert.equal(elements['startup-status'].hidden, false);
});

test('retry only removes app caches and the current scope worker; saved preferences are never accessed', async () => {
  const deleted: string[] = [];
  const unregistered: string[] = [];
  let click: () => void = () => {};
  let destination = '';
  const scope = 'https://example.com/bfu-smart-travel/';
  const caches = { keys: async () => ['beijing-travel-v8', 'unrelated-app'],
    delete: async (key: string) => { deleted.push(key); } };
  const navigator = { serviceWorker: { getRegistrations: async () => [scope, 'https://example.com/other/']
    .map((url) => ({ scope: url, unregister: async () => { unregistered.push(url); } })) } };
  const window = { caches, addEventListener: () => {}, setTimeout: () => 1,
    location: { href: scope + '?source=phone#map', replace: (url: string) => { destination = url; } } };
  const elements: Record<string, any> = { 'startup-status': {}, 'startup-message': {},
    'startup-retry': { addEventListener: (_: string, cb: () => void) => { click = cb; } } };
  runInNewContext(bootScript, { window, caches, navigator, URL,
    document: { getElementById: (id: string) => elements[id] } });
  click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(deleted, ['beijing-travel-v8']);
  assert.deepEqual(unregistered, [scope]);
  assert.equal(new URL(destination).searchParams.get('source'), 'phone');
  assert.equal(new URL(destination).hash, '#map');
  assert.ok(new URL(destination).searchParams.get('_reload'));
});

function worker(fetch: (...args: any[]) => Promise<Response>, match: (...args: any[]) => Promise<Response | undefined> = async () => undefined) {
  const events: Record<string, (event: any) => void> = {};
  const stored: string[] = [];
  const deleted: string[] = [];
  const waits: Promise<unknown>[] = [];
  const scope = 'https://example.com/bfu-smart-travel/';
  runInNewContext(swScript, { URL, Response, fetch,
    self: { location: { origin: 'https://example.com' }, registration: { scope },
      clients: { claim: async () => {} }, addEventListener: (name: string, cb: (event: any) => void) => { events[name] = cb; } },
    caches: { match, keys: async () => ['beijing-travel-v8', 'beijing-travel-v9', 'other-app'],
      delete: async (key: string) => { deleted.push(key); },
      open: async () => ({ put: async (request: any) => { stored.push(request.url); } }) } });
  async function request(path: string, mode = 'navigate', destination = '') {
    let result: Promise<Response> | undefined;
    events.fetch({ request: { url: scope + path, method: 'GET', mode, destination },
      respondWith: (promise: Promise<Response>) => { result = promise; },
      waitUntil: (promise: Promise<unknown>) => { waits.push(promise); } });
    const response = await result;
    await Promise.all(waits);
    return response;
  }
  return { events, request, stored, deleted, waits };
}

test('offline startup returns readable HTML when no cached page exists, and subpath fallback uses the actual scope', async () => {
  const unavailable = async () => { throw new Error('offline'); };
  const fresh = worker(unavailable);
  const response = await fresh.request('?_reload=1');
  assert.equal(response?.status, 503);
  assert.match(await response!.text(), /当前网络不可用/);
  const cached = worker(unavailable, async (url) => url === 'https://example.com/bfu-smart-travel/index.html'
    ? new Response('cached app') : undefined);
  assert.equal(await (await cached.request(''))!.text(), 'cached app');
});

test('workers preserve unrelated caches, bypass APIs under a Pages subpath, and reject HTML masquerading as JavaScript', async () => {
  const sw = worker(async () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } }));
  sw.events.activate({ waitUntil: (promise: Promise<unknown>) => sw.waits.push(promise) });
  await Promise.all(sw.waits);
  assert.deepEqual(sw.deleted, ['beijing-travel-v8']);
  assert.equal(await sw.request('api/places', 'cors'), undefined);
  await sw.request('assets/missing.js', 'cors', 'script');
  assert.deepEqual(sw.stored, []);
});
