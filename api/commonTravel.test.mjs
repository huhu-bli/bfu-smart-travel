import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../database/migrate.mjs';
import { seedPlaces } from '../database/seed.ts';
import { importPlaces } from '../server/placeMaintenance.mjs';
import { parsePlaceQuery, queryPlaces } from '../server/placeQueries.mjs';
import { buildCommonTravelImport } from '../scripts/build-common-travel.mjs';
import { wgs84ToGcj02 } from '../scripts/support/wgs84-gcj02.mjs';
import { runTool } from '../src/lib/toolExecutor.ts';
import { resolveDatabaseTravelTarget } from '../src/lib/databaseTravelTarget.ts';
import { resolveTravelTarget } from '../src/lib/travelTarget.ts';
import { answerLocally } from '../src/lib/localAgent.ts';

const manifest = JSON.parse(await readFile(new URL('../database/catalogs/beijing-common-travel.provenance.json', import.meta.url)));
const document = JSON.parse(await readFile(new URL('../database/catalogs/beijing-common-travel.json', import.meta.url)));
const db = new PGlite();
const ready = (async () => { await migrate(db); await seedPlaces(db); })();
after(async () => { await ready; await db.close(); });
const search = async (params) => queryPlaces(db, parsePlaceQuery(new URLSearchParams(params)));
const repository = {
  city: async (filters = {}) => {
    const params = new URLSearchParams({ scope: 'city', limit: String(filters.limit ?? 20), offset: String(filters.offset ?? 0) });
    if (filters.keyword) params.set('q', filters.keyword);
    filters.ids?.forEach((id) => params.append('id', id));
    filters.districtIds?.forEach((id) => params.append('district_id', id));
    filters.interests?.forEach((id) => params.append('interest', id));
    return search(params);
  },
  campus: async (id) => search({ scope: 'campus', campus_id: id, limit: '100' }),
};

test('common travel pack keeps traceable coordinates, honest unknown fields and reproducible conversion', () => {
  assert.deepEqual(buildCommonTravelImport(manifest), document);
  const converted = wgs84ToGcj02(116.404, 39.915);
  assert.ok(Math.abs(converted[0] - 116.41024449916938) < 1e-10);
  assert.ok(Math.abs(converted[1] - 39.91640428150164) < 1e-10);
  assert.deepEqual(wgs84ToGcj02(0, 0), [0, 0]);
  assert.throws(() => wgs84ToGcj02(NaN, 40));
  assert.equal(document.places.length, 19);
  assert.ok(document.places.every((p) => p.openingHours === null && p.bookingUrl === null && p.sources.length >= 2));
  assert.ok(document.places.every((p) => p.coordinateSystem === 'gcj02' && p.category !== 'restaurant'));
  const imprecise = structuredClone(manifest);
  imprecise.places[0].coordinate.precision = 0.01;
  assert.throws(() => buildCommonTravelImport(imprecise), /坐标/);
});

test('common travel import previews safely and adds 19 places without replacing original campus or city data', async () => {
  await ready;
  await importPlaces(db, document);
  assert.equal((await search({ scope: 'city' })).total, 48);
  await importPlaces(db, document, { apply: true, actor: 'common-travel-review' });
  assert.equal((await search({ scope: 'city' })).total, 67);
  assert.equal((await search({ scope: 'campus', campus_id: 'bfu' })).total, 25);
  assert.equal((await search({ scope: 'campus', campus_id: 'bjtu' })).total, 13);
  await assert.rejects(importPlaces(db, document, { apply: true }), /已存在/);
  assert.equal((await search({ id: 'niujie' })).places[0].version, 1);
  assert.equal((await search({ scope: 'city' })).total, 67);
});

test('common travel database queries cover food, indoor science, parks and individual museum branches', async () => {
  await ready;
  assert.ok((await search({ scope: 'city', district_id: 'xicheng', interest: 'food' })).places.some((p) => p.id === 'niujie'));
  const family = await search({ scope: 'city', q: '亲子科普' });
  assert.deepEqual(new Set(family.places.map((p) => p.id)), new Set(['china-science-technology-museum', 'national-natural-history-museum']));
  assert.equal((await search({ scope: 'city', q: '樱花', district_id: 'haidian' })).places[0].id, 'yuyuantan-park');
  const rail = (await search({ id: 'china-railway-museum-dongjiao' })).places[0];
  assert.equal(rail.districtId, 'chaoyang');
  assert.match(rail.address, /南春路/);
  assert.ok((await search({ scope: 'city', q: '军博' })).places.some((p) => p.id === 'military-museum'));
});

test('database-only destinations switch a campus conversation into a city route with the named food stop', async () => {
  await ready;
  const campus = resolveTravelTarget('北交');
  const target = await resolveDatabaseTravelTarget('改去牛街逛半天', campus, repository);
  assert.equal(target.kind, 'district');
  assert.deepEqual(target.districtIds, ['xicheng']);
  const previous = { scene: 'campus-route', target: campus, minutes: 180, interests: ['food'], gateId: 'bjtu-south-gate' };
  const answer = await answerLocally('改去牛街逛半天，想吃北京小吃', previous, repository);
  assert.equal(answer.memory.scene, 'outside-trip');
  assert.equal(answer.plan, null);
  assert.ok(answer.beijingPlan);
  const ids = [answer.beijingPlan.origin.id, ...answer.beijingPlan.stops.map((s) => s.place.id)];
  assert.ok(ids.includes('niujie'));
  assert.ok(!ids.some((id) => id.startsWith('bjtu-')));
  const retained = await resolveDatabaseTravelTarget('不去牛街了', campus, repository);
  assert.equal(retained.campusId, 'bjtu');
});

test('Agent builds usable classic, science and food plans from the expanded SQL repository', async () => {
  await ready;
  const cases = [
    { minutes: 480, ids: ['forbidden-city', 'jingshan-park', 'qianmen-street'], interests: ['culture','food'] },
    { minutes: 240, ids: ['niujie', 'taoranting-park'], interests: ['food','plant'] },
    { minutes: 180, ids: ['china-science-technology-museum'], interests: ['research'] },
  ];
  for (const item of cases) {
    const context = { placeRepository: repository, target: { kind: 'city', label: '北京市', routeSupported: true, explicit: true },
      plan: null, planOptions: null, beijingPlan: null, beijingPlanOptions: null, spotIds: [], placeIds: [], tripIds: [], trace: [] };
    const result = JSON.parse(await runTool('build_beijing_route', JSON.stringify({ minutes: item.minutes, pace: 'normal',
      start_place_id: item.ids[0], include_place_ids: item.ids, interests: item.interests }), context));
    assert.ok(!result.error, JSON.stringify(result));
    const ids = [context.beijingPlan.origin.id, ...context.beijingPlan.stops.map((s) => s.place.id)];
    for (const id of item.ids) assert.ok(ids.includes(id), `${id} missing from ${ids}`);
    assert.ok(context.beijingPlan.totalMinutes <= item.minutes);
  }
});
