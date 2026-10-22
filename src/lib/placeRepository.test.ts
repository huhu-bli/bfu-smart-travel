import test from 'node:test';
import assert from 'node:assert/strict';
import { databasePlaces, PlaceDatabaseError } from './placeRepository';

const success = () => new Response(JSON.stringify({ source: 'database', total: 1, limit: 20, offset: 0,
  places: [{ id: 'niujie', name: '牛街' }] }), { status: 200 });

test('place queries retry a temporary network failure once and preserve query filters', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    calls.push(url);
    if (calls.length === 1) throw new TypeError('Failed to fetch');
    return success();
  });
  const page = await databasePlaces.city({ keyword: '牛街', districtIds: ['xicheng'], offset: 12 });
  assert.equal(page.places[0].id, 'niujie');
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
  const query = new URL(calls[0], 'https://example.com').searchParams;
  assert.equal(query.get('q'), '牛街');
  assert.equal(query.get('district_id'), 'xicheng');
  assert.equal(query.get('offset'), '12');
});

test('place queries recover from transient gateway status and stop after two failures', async (t) => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => ++count === 1 ? new Response('gateway timeout', { status: 504 }) : success());
  assert.equal((await databasePlaces.city()).total, 1);
  assert.equal(count, 2);
  const failed = t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(databasePlaces.city(), PlaceDatabaseError);
  assert.equal(failed.mock.callCount(), 2);
});

test('place queries do not retry authorization errors, invalid filters or malformed successful responses', async (t) => {
  for (const status of [400, 401, 403, 200]) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'invalid response' }), { status }));
    await assert.rejects(databasePlaces.city(), PlaceDatabaseError);
    assert.equal(fetch.mock.callCount(), 1, String(status));
    fetch.mock.restore();
  }
});

test('changing filters cancels an active request and prevents a retry', async (t) => {
  const controller = new AbortController();
  let observedSignal: AbortSignal | undefined;
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    observedSignal = options.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => observedSignal!.addEventListener('abort', () => reject(observedSignal!.reason), { once: true }));
  });
  const result = databasePlaces.city({ keyword: '旧筛选' }, controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(observedSignal?.aborted, true);
  assert.equal(fetch.mock.callCount(), 1);
});

test('cancelling during retry backoff never starts another request', async (t) => {
  const controller = new AbortController();
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    setTimeout(() => controller.abort(), 10);
    throw new TypeError('temporary network failure');
  });
  await assert.rejects(databasePlaces.city({}, controller.signal), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 1);
});

test('queries work without modern AbortSignal helpers or reason, including cancellation before fetch', async (t) => {
  for (const [object, key] of [[AbortSignal, 'any'], [AbortSignal, 'timeout'],
    [AbortSignal.prototype, 'throwIfAborted'], [AbortSignal.prototype, 'reason']] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { configurable: true, value: undefined });
    t.after(() => { if (descriptor) Object.defineProperty(object, key, descriptor); else Reflect.deleteProperty(object, key); });
  }
  const fetch = t.mock.method(globalThis, 'fetch', async () => success());
  assert.equal((await databasePlaces.city()).total, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(databasePlaces.city({}, controller.signal), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 1);
});

test('query timeout covers a stalled response body and completed queries release their abort listener', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const remove = t.mock.method(controller.signal, 'removeEventListener');
  let started!: () => void;
  const reading = new Promise<void>((resolve) => { started = resolve; });
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => ({
    status: 200, ok: true,
    json: () => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true });
      started();
    }),
  } as Response));
  const pending = databasePlaces.city({}, controller.signal);
  await reading;
  t.mock.timers.tick(12001);
  await assert.rejects(pending, /请求超时/);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(remove.mock.callCount(), 1);
});
