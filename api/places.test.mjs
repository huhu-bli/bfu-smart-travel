import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../database/migrate.mjs';
import { seedPlaces } from '../database/seed.ts';
import { parsePlaceQuery, queryPlaces } from '../server/placeQueries.mjs';
import { createPlacesHandler } from './places.mjs';
import { DatabaseUnavailableError } from '../server/database.mjs';
import { runTool } from '../src/lib/toolExecutor.ts';
import { PlaceDatabaseError } from '../src/lib/placeRepository.ts';

const db = new PGlite();
const ready = (async () => { await migrate(db); await seedPlaces(db); })();
after(async () => { await ready; await db.close(); });
const search = async (params) => { await ready; return queryPlaces(db, parsePlaceQuery(new URLSearchParams(params))); };
const repository = {
  city: async (filters = {}) => {
    const params = new URLSearchParams({ scope: 'city', limit: String(filters.limit ?? 20), offset: String(filters.offset ?? 0) });
    if (filters.keyword) params.set('q', filters.keyword);
    filters.ids?.forEach((id) => params.append('id', id));
    filters.districtIds?.forEach((id) => params.append('district_id', id));
    filters.interests?.forEach((id) => params.append('interest', id));
    return search(params);
  },
};

test('PostgreSQL migration and seed persist all city/campus places, and replay preserves edits', async () => {
  await ready;
  assert.equal((await search({ scope: 'city' })).total, 48);
  assert.equal((await search({ scope: 'campus', campus_id: 'bfu' })).total, 25);
  assert.equal((await search({ scope: 'campus', campus_id: 'bjtu' })).total, 13);
  await db.query("UPDATE places SET tips = $1 WHERE id = 'forbidden-city'", ['已人工修订']);
  await migrate(db);
  assert.equal((await seedPlaces(db)).inserted, 0);
  const result = await search({ id: 'forbidden-city' });
  assert.equal(result.places[0].tips, '已人工修订');
  assert.equal(result.places[0].openingHours, null);
  assert.equal(result.places[0].sources[0].verificationStatus, 'unverified');
});

test('SQL filters combine region and tag, retain pagination counts, and treat SQL/wildcards as literal text', async () => {
  const result = await search({ q: '银杏', district_id: 'dongcheng', interest: 'plant' });
  assert.equal(result.total, 1);
  assert.equal(result.places[0].id, 'ditan-park');
  assert.equal((await search({ q: "' OR 1=1 --" })).total, 0);
  assert.equal((await search({ q: '%' })).total, 0);
  assert.equal((await search({ q: '_' })).total, 0);
  const emptyPage = await search({ offset: '9999' });
  assert.ok(emptyPage.total >= 48);
  assert.deepEqual(emptyPage.places, []);
  await db.query("UPDATE places SET status='archived' WHERE id='ditan-park'");
  assert.equal((await search({ id: 'ditan-park' })).total, 0);
  await db.query("UPDATE places SET status='active' WHERE id='ditan-park'");
});

test('a newly inserted database place is immediately searchable and plannable by the Agent without a frontend rebuild', async () => {
  await ready;
  await db.query(`INSERT INTO places(id,scope,district_id,name,category,lng,lat,visit_minutes,short,description)
    VALUES ('database-new-park','city','haidian','数据库新增测试园','park',116.31,39.99,30,'新资料','仅存在于数据库')`);
  await db.query("INSERT INTO place_tags(place_id,tag_id) VALUES ('database-new-park','plant')");
  const context = { placeRepository: repository,
    target: { kind: 'beijing', label: '北京市', routeSupported: true, explicit: true },
    plan: null, planOptions: null, beijingPlan: null, beijingPlanOptions: null,
    spotIds: [], placeIds: [], tripIds: [], trace: [] };
  const listed = JSON.parse(await runTool('list_beijing_places', '{"keyword":"新增测试园"}', context));
  assert.equal(listed.source, 'database');
  assert.equal(listed.places[0].id, 'database-new-park');
  const detail = JSON.parse(await runTool('get_beijing_place_detail', '{"place_id":"database-new-park"}', context));
  assert.equal(detail.description, '仅存在于数据库');
  const plan = JSON.parse(await runTool('build_beijing_route', JSON.stringify({ minutes: 60, district_ids: ['haidian'],
    start_place_id: 'database-new-park', include_place_ids: ['database-new-park'], interests: ['plant'] }), context));
  assert.equal(plan.mustSeeStops[0].placeId, 'database-new-park');
  await db.query("DELETE FROM places WHERE id='database-new-park'");
});

test('query API validates limits, rejects writes and foreign origins, and does not expose database credentials', async () => {
  const invoke = async (handler, url = '/api/places', method = 'GET', origin = '') => {
    const headers = {};
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k] = v; }, end: (body) => { res.body = body; } };
    await handler({ url, method, headers: { origin } }, res);
    return res;
  };
  const handler = createPlacesHandler(() => db);
  assert.equal((await invoke(handler, '/api/places?limit=101')).statusCode, 400);
  assert.equal((await invoke(handler, '/api/places?scope=campus')).statusCode, 400);
  assert.equal((await invoke(handler, '/api/places?sql=DELETE')).statusCode, 400);
  assert.equal((await invoke(handler, '/api/places', 'POST')).statusCode, 405);
  assert.equal((await invoke(handler, '/api/places', 'GET', 'https://untrusted.example')).statusCode, 403);
  const missing = await invoke(createPlacesHandler(() => { throw new DatabaseUnavailableError('DATABASE_NOT_CONFIGURED'); }));
  assert.equal(missing.statusCode, 503);
  assert.equal(JSON.parse(missing.body).code, 'DATABASE_NOT_CONFIGURED');
  const broken = await invoke(createPlacesHandler(() => { throw new Error('postgres://secret-password@host/database'); }));
  assert.equal(broken.statusCode, 503);
  assert.doesNotMatch(broken.body, /secret-password/);
});

test('Agent database failures stop planning instead of using old static places', async () => {
  const broken = { city: async () => { throw new PlaceDatabaseError('数据库暂时不可用'); } };
  const context = { placeRepository: broken, target: { kind: 'beijing', label: '北京市' }, trace: [] };
  await assert.rejects(runTool('build_beijing_route', '{"minutes":60}', context), /数据库暂时不可用/);
  assert.ok(context.trace.some((line) => line.includes('景点数据库不可用')));
});
