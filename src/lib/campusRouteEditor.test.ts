import test from 'node:test';
import assert from 'node:assert/strict';
import { PACES } from '../data/interests';
import { BJTU_SPOTS } from '../data/campuses/bjtu';
import { SPOTS } from '../data/spots';
import type { CampusGlobalRoutePlan } from '../types';
import { campusRouteSpots, prepareCampusRoute } from './campusRouteEditor';
import type { CatalogSpot, PlaceRepository } from './placeRepository';
import { PlaceDatabaseError } from './placeRepository';
import { buildRoute } from './planner';
import { decodeStoredGlobalRoute } from './storedState';

function route(): CampusGlobalRoutePlan {
  const options = { campusId: 'bjtu' as const, campusLabel: '北交', interests: [] as [],
    minutes: 75, pace: PACES[1], startId: 'bjtu-south-gate' };
  return { kind: 'campus', plan: buildRoute(BJTU_SPOTS, options), options, source: 'agent', updatedAt: new Date().toISOString() };
}
function repository(spots: CatalogSpot[], calls: string[] = []): PlaceRepository {
  return {
    city: async () => { throw new Error('must not query city'); },
    campus: async (id, filters = {}) => {
      calls.push(id);
      return { source: 'database', total: spots.length, offset: filters.offset ?? 0, limit: filters.limit ?? 100,
        places: spots.slice(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 100)) };
    },
  };
}
const databaseSpots = BJTU_SPOTS.map((spot) => ({ ...spot, campusId: 'bjtu' }));
const newSpot: CatalogSpot = { ...databaseSpots.find((spot) => spot.kind !== '入口')!, id: 'bjtu-new-database-spot',
  name: '数据库新增点位', visit: 10, description: '数据库最新说明', sources: [] };

test('regeneration stays in BJTU with exact duration, gate and database data', async () => {
  const current = route();
  const calls: string[] = [];
  const result = await prepareCampusRoute(repository([...databaseSpots, newSpot], calls), current,
    { ...current.options, includeSpotIds: [newSpot.id] });
  assert.deepEqual(calls, ['bjtu']);
  assert.equal(result.options.campusId, 'bjtu');
  assert.equal(result.options.minutes, 75);
  assert.equal(result.plan.origin.id, 'bjtu-south-gate');
  assert.ok(result.plan.stops.some((stop) => stop.spot.id === newSpot.id));
  assert.ok(result.plan.stops.every((stop) => !SPOTS.some((spot) => spot.id === stop.spot.id)));
});

test('editing preserves database-only spots and revised dwell/details, never restores archived candidates', async () => {
  const current = route();
  const revised = { ...databaseSpots.find((spot) => spot.kind !== '入口')!, visit: 20, description: '修订后的说明' };
  const db = repository([databaseSpots[0], revised, newSpot]);
  const result = await prepareCampusRoute(db, current, current.options, [revised.id, newSpot.id]);
  assert.deepEqual(new Set(result.plan.stops.map((stop) => stop.spot.id)), new Set([revised.id, newSpot.id]));
  const stop = result.plan.stops.find((stop) => stop.spot.id === revised.id)!;
  assert.equal(stop.spot.description, '修订后的说明');
  assert.equal(stop.leave - stop.arrive, 20);
  assert.equal(result.spotSource, 'database');
});

test('database source survives manual edit, persistence and a second edit', async () => {
  const current = route();
  const db = repository([...databaseSpots, newSpot]);
  const first = await prepareCampusRoute(db, current, current.options, [newSpot.id]);
  const restored = decodeStoredGlobalRoute(JSON.parse(JSON.stringify({ ...current, ...first, source: 'manual' })))!;
  assert.equal(restored.kind, 'campus');
  if (restored.kind !== 'campus') throw new Error('wrong kind');
  const second = await prepareCampusRoute(db, restored, restored.options, [newSpot.id]);
  assert.equal(second.plan.stops[0].spot.description, newSpot.description);
});

test('archived selected spot or origin fails without modifying the old route', async () => {
  const current = route();
  const before = JSON.stringify(current);
  await assert.rejects(prepareCampusRoute(repository(databaseSpots), current, current.options, [newSpot.id]), /已不可用/);
  await assert.rejects(prepareCampusRoute(repository(databaseSpots.filter((spot) => spot.id !== current.options.startId)), current, current.options), /已不可用/);
  assert.equal(JSON.stringify(current), before);
});

test('database errors cannot fall back to static points', async () => {
  const current = route();
  const db = repository([]);
  db.campus = async () => { throw new PlaceDatabaseError('数据库不可用'); };
  await assert.rejects(prepareCampusRoute(db, current, current.options), /数据库不可用/);
  await assert.rejects(prepareCampusRoute(repository([]), current, current.options), /暂无可用点位/);
});

test('cross-campus data and attempts to change schools are rejected', async () => {
  const current = route();
  await assert.rejects(prepareCampusRoute(repository(databaseSpots), current, { ...current.options, campusId: 'bfu' }), /更换/);
  await assert.rejects(campusRouteSpots(repository([{ ...newSpot, campusId: 'bfu' }]), current), /范围不一致/);
});

test('all campus pages are read so new points after the first 100 remain editable', async () => {
  const spots = [databaseSpots[0], ...Array.from({ length: 100 }, (_, index) => ({ ...newSpot, id: `new-${index}` }))];
  const current = route();
  const calls: string[] = [];
  const result = await prepareCampusRoute(repository(spots, calls), current, current.options, ['new-99']);
  assert.equal(calls.length, 2);
  assert.equal(result.plan.stops[0].spot.id, 'new-99');
});

test('explicit static guides remain editable offline with their own school data', async () => {
  const current = { ...route(), spotSource: 'static' as const };
  const db = repository([]);
  db.campus = async () => { throw new Error('offline'); };
  const id = BJTU_SPOTS.find((spot) => spot.kind !== '入口')!.id;
  const result = await prepareCampusRoute(db, current, current.options, [id]);
  assert.equal(result.spotSource, 'static');
  assert.equal(result.plan.stops[0].spot.id, id);
});

test('removing the final stop keeps an empty route instead of adding an unwanted point', async () => {
  const current = route();
  const result = await prepareCampusRoute(repository([...databaseSpots, newSpot]), current, current.options, []);
  assert.equal(result.plan.stops.length, 0);
  assert.equal(result.plan.optionalStops.length, 0);
});
