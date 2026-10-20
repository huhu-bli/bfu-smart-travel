import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import App from '../App';
import type { GlobalRoutePlan } from '../types';
import { SPOTS } from '../data/spots';
import { BEIJING_PLACES } from '../data/beijingPlaces';
import { PACES } from '../data/interests';
import { buildRoute } from './planner';
import { buildBeijingRoute } from './beijingPlanner';
import { decodeStoredGlobalRoute, restoreStoredValue } from './storedState';

const options = { interests: ['plant' as const], minutes: 180, pace: PACES[1], startId: 'gate-main' };
const campus = { kind: 'campus' as const, plan: buildRoute(SPOTS, options), options,
  source: 'manual' as const, updatedAt: '2026-10-20T12:00:00Z' };
const cityOptions = { scope: 'beijing' as const, interests: ['culture' as const], minutes: 480,
  pace: PACES[1], travelMode: 'mixed' as const, districtIds: [], startPlaceId: 'forbidden-city',
  includePlaceIds: ['forbidden-city', 'temple-of-heaven'], preserveSelectedStops: true };
const city = { kind: 'beijing' as const, plan: buildBeijingRoute(cityOptions, BEIJING_PLACES), options: cityOptions,
  source: 'agent' as const, updatedAt: '2026-10-20T12:00:00Z' };

test('stored plans retain valid city edits and migrate legacy campus data without losing the route', () => {
  assert.deepEqual(decodeStoredGlobalRoute(JSON.parse(JSON.stringify(city))), city);
  const { kind: _kind, ...legacy } = campus;
  assert.deepEqual(decodeStoredGlobalRoute(legacy), campus);
  assert.deepEqual(restoreStoredValue<GlobalRoutePlan>(JSON.stringify(city), campus, decodeStoredGlobalRoute), city);
});

test('malformed stored route structures recover safely, including broken nested points and paths', () => {
  const nested = structuredClone(city);
  (nested.plan.stops[0].place as unknown as { highlights: null }).highlights = null;
  const invalidPath = structuredClone(city);
  invalidPath.plan.stops[0].routePath = [[NaN, 40]];
  const variants = [null, [], {}, { ...city, kind: 'unknown-v2' }, { ...city, plan: { ...city.plan, stops: null } },
    { ...city, options: { ...city.options, pace: null } }, { ...city, plan: { ...city.plan, routeNotice: {} } }, nested, invalidPath];
  for (const value of variants) assert.equal(restoreStoredValue<GlobalRoutePlan>(JSON.stringify(value), campus, decodeStoredGlobalRoute), campus);
  assert.equal(restoreStoredValue<GlobalRoutePlan>('{bad JSON', campus, decodeStoredGlobalRoute), campus);
});

test('preferences and checklists reject null, objects and mixed arrays without throwing', () => {
  assert.deepEqual(restoreStoredValue('null', ['plant']), ['plant']);
  assert.deepEqual(restoreStoredValue('[null,42]', [] as string[]), []);
  assert.deepEqual(restoreStoredValue('["camera"]', [] as string[]), ['camera']);
  assert.equal(restoreStoredValue('{}', 'normal'), 'normal');
  assert.equal(restoreStoredValue('"easy"', 'normal'), 'easy');
});

test('the actual app renders instead of crashing when browser caches contain valid JSON of the wrong shape', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); });
  const values = new Map<string, string>([
    ['bfu-smart-travel:global-route-plan:v1', '{"kind":"beijing","plan":null}'],
    ['bfu-smart-travel:interests', 'null'], ['bfu-smart-travel:favorites', '{}'],
  ]);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    innerWidth: 390, innerHeight: 844, localStorage: { getItem: (key: string) => values.get(key) ?? null },
  } });
  const html = renderToString(createElement(App));
  assert.match(html, /北京智能旅行/);
  assert.match(html, /我的路线计划/);
});
