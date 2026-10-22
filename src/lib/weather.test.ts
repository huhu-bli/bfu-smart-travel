import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWeather } from './weather';

const forecast = (days: string[]) => ({ daily: { time: days, weather_code: [0, 3],
  temperature_2m_max: [20, 10], temperature_2m_min: [8, 2], precipitation_probability_max: [0, 10], precipitation_sum: [0, 0] } });

test('weather preserves an explicit date and selects that day instead of today', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(forecast(['2026-10-22', '2026-10-23']))));
  const result = await fetchWeather('北林', '2026-10-23');
  assert.equal(result.date, '2026-10-23');
  assert.equal((result.forecast as { temperatureMaxC: number }).temperatureMaxC, 10);
});

test('invalid dates fail before a network call, and unavailable dates cannot fall back to today', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(forecast(['2026-10-22']))));
  for (const date of ['2026-02-30', '2026-13-01', '2026-10-2', 'next Thursday']) {
    await assert.rejects(fetchWeather('北林', date), /日期无效/);
  }
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(fetchWeather('北林', '2026-10-30'), /无法查询 2026-10-30/);
});

test('missing precipitation data never becomes a claim of low rain risk', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ daily: { time: ['2026-10-23'] } })));
  assert.match(String((await fetchWeather('北林', '2026-10-23')).advice), /资料不足/);
});
