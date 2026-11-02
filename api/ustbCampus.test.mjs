import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../database/migrate.mjs';
import { seedPlaces } from '../database/seed.ts';
import { validateImport } from '../server/placeValidation.mjs';
import { exportPlaces, importPlaces, setPlaceStatus } from '../server/placeMaintenance.mjs';
import { parsePlaceQuery, queryPlaces } from '../server/placeQueries.mjs';
import { applyCampusCatalogs } from '../scripts/apply-campus-catalogs.mjs';
import { applyReviewedCatalogs } from '../scripts/apply-reviewed-catalogs.mjs';
import { resolveTravelTarget } from '../src/lib/travelTarget.ts';
import { routeScene, sceneForTarget } from '../src/lib/sceneRouter.ts';
import { runTool } from '../src/lib/toolExecutor.ts';
import { answerLocally } from '../src/lib/localAgent.ts';
import { prepareCampusRoute } from '../src/lib/campusRouteEditor.ts';
import { USTB_SPOTS } from '../src/data/campuses/ustb.ts';
import { TOOL_SCHEMAS } from '../src/lib/toolSchemas.ts';

const db = new PGlite();
const ready = (async () => { await migrate(db); await seedPlaces(db); })();
after(async () => { await ready; await db.close(); });
const repository = {
  city: async (filters = {}) => {
    await ready;
    const params = new URLSearchParams({ scope: 'city', limit: String(filters.limit ?? 20), offset: String(filters.offset ?? 0) });
    if (filters.keyword) params.set('q', filters.keyword);
    filters.ids?.forEach((id) => params.append('id', id));
    filters.districtIds?.forEach((id) => params.append('district_id', id));
    return queryPlaces(db, parsePlaceQuery(params));
  },
  campus: async (campusId, filters = {}) => {
    await ready;
    const params = new URLSearchParams({ scope: 'campus', campus_id: campusId,
      limit: String(filters.limit ?? 20), offset: String(filters.offset ?? 0) });
    if (filters.keyword) params.set('q', filters.keyword);
    filters.ids?.forEach((id) => params.append('id', id));
    return queryPlaces(db, parsePlaceQuery(params));
  },
};
const context = (text = '北京科技大学校园里逛两小时') => ({
  target: resolveTravelTarget(text), placeRepository: repository,
  plan: null, planOptions: null, beijingPlan: null, beijingPlanOptions: null,
  spotIds: [], placeIds: [], tripIds: [], trace: [],
});

test('USTB catalog is the shared source for ten distinct campus points including four gates', async () => {
  const document = JSON.parse(await readFile(new URL('../database/catalogs/ustb-campus-2026-11-01.json', import.meta.url)));
  const records = validateImport(document);
  assert.equal(records.length, 10);
  assert.equal(records.filter((place) => place.category === '入口').length, 4);
  assert.deepEqual(new Set(records.map((place) => place.id)), new Set(USTB_SPOTS.map((spot) => spot.id)));
  assert.ok(records.every((place) => place.campusId === 'ustb' && place.id.startsWith('ustb-')));
  assert.ok(records.every((place) => place.sources.some((source) => source.kind === 'official')));
  assert.ok(records.every((place) => place.openingHours === null && /估算/.test(place.tips)));
});

test('aliases, negated schools and a campus ginkgo request resolve to USTB tools', () => {
  for (const alias of ['北京科技大学', '北科大', '北科', '贝壳', 'USTB', 'Ustb', 'ustb']) {
    const text = `去${alias}校园里看银杏，规划两小时`;
    const target = resolveTravelTarget(text);
    assert.equal(target.campusId, 'ustb', alias);
    assert.equal(target.routeSupported, true);
    assert.equal(sceneForTarget(routeScene(text), target), 'campus-route');
  }
  assert.equal(resolveTravelTarget('去北科大，不用北林和北交的点位').campusId, 'ustb');
  assert.equal(resolveTravelTarget('从天津出发，去北京科技大学学院路主校区').routeSupported, true);
  assert.equal(resolveTravelTarget('去北科大学院路校区，不去昌平校区').routeSupported, true);
  const first = resolveTravelTarget('去北科大');
  assert.equal(resolveTravelTarget('改成一小时', first).campusId, 'ustb');
  const schema = TOOL_SCHEMAS.find((tool) => tool.name === 'build_route');
  assert.ok(schema.parameters.properties.campus_id.enum.includes('ustb'));
  assert.match(schema.parameters.properties.start_gate.description, /ustb-west-gate/);
});

test('real SQL queries expose USTB independently with provenance and aliases', async () => {
  const page = await repository.campus('ustb', { limit: 100 });
  assert.equal(page.total, 10);
  assert.ok(page.places.every((place) => place.campusId === 'ustb'));
  assert.equal((await repository.campus('ustb', { keyword: '图书馆' })).places[0].id, 'ustb-library');
  assert.equal((await repository.campus('bfu', { limit: 100 })).total, 25);
  assert.equal((await repository.campus('bjtu', { limit: 100 })).total, 13);
  assert.ok(page.places.every((place) => place.sources.length === 2));
});

test('Agent tools cannot use a different school or an unsupported USTB campus', async () => {
  const c = context();
  const listed = JSON.parse(await runTool('list_spots', '{"campus_id":"bfu"}', c));
  assert.equal(listed.campusId, 'ustb');
  assert.ok(listed.spots.every((spot) => spot.id.startsWith('ustb-')));
  await runTool('build_route', JSON.stringify({ campus_id: 'bjtu', minutes: 120,
    start_gate: 'ustb-north-gate', include_spot_ids: ['ustb-library', 'ustb-ginkgo-walk'] }), c);
  assert.equal(c.plan.origin.id, 'ustb-north-gate');
  assert.equal(c.planOptions.campusId, 'ustb');
  assert.ok(c.plan.stops.every((stop) => stop.spot.id.startsWith('ustb-')));
  assert.ok(c.plan.totalMinutes <= 120);
  for (const area of ['昌平', '雄安', '管庄', '天津', '顺德', '西三旗']) {
    const unsupported = context(`去北京科技大学${area}校区规划路线`);
    assert.equal(unsupported.target.routeSupported, false);
    const result = JSON.parse(await runTool('build_route', '{}', unsupported));
    assert.match(result.error, /尚未收录/);
    assert.equal(unsupported.plan, null);
  }
});

test('local assistant supports USTB gates, follow-ups and unprefixed point names with real SQL', async () => {
  const first = await answerLocally('北京科技大学校园里逛2小时，从东门出发，想拍照', null, repository);
  assert.equal(first.planOptions.campusId, 'ustb');
  assert.equal(first.plan.origin.id, 'ustb-east-gate');
  const next = await answerLocally('改成1小时，换成北门', first.memory, repository);
  assert.equal(next.planOptions.minutes, 60);
  assert.equal(next.plan.origin.id, 'ustb-north-gate');
  const detail = await answerLocally('讲讲北科大的图书馆', next.memory, repository);
  assert.ok(detail.spotIds.includes('ustb-library'));
  assert.doesNotMatch(detail.text, /北林|北交/);
});

test('manual regeneration and edits retain database updates and USTB-specific points', async () => {
  await ready;
  const edit = await exportPlaces(db, 'ustb-library');
  edit.places[0].description = '数据库修订后的北科大图书馆介绍';
  await importPlaces(db, edit, { apply: true });
  const c = context();
  await runTool('build_route', '{"minutes":120,"include_spot_ids":["ustb-library"]}', c);
  const route = { kind: 'campus', source: 'agent', spotSource: 'database', plan: c.plan,
    options: c.planOptions, updatedAt: new Date().toISOString() };
  const result = await prepareCampusRoute(repository, route, { ...c.planOptions, minutes: 180 }, ['ustb-library']);
  assert.equal(result.options.campusId, 'ustb');
  assert.equal(result.plan.stops[0].spot.description, edit.places[0].description);
  assert.equal(result.plan.stops.length, 1);
  assert.equal((await seedPlaces(db)).inserted, 0);
  assert.equal((await repository.campus('ustb', { ids: ['ustb-library'] })).places[0].description, edit.places[0].description);
});

test('production release backfills the campus batch and replay never overwrites edits or restores archived points', async () => {
  await ready;
  // 模拟旧生产库：旧城市及校园已存在，北科大批次尚未部署。
  await db.query("DELETE FROM places WHERE campus_id='ustb'");
  await db.query("DELETE FROM catalog_batches WHERE id='ustb-campus-2026-11-01'");
  const common = JSON.parse(await readFile(new URL('../database/catalogs/beijing-common-travel.json', import.meta.url)));
  await importPlaces(db, common, { apply: true });
  let closed = false;
  const result = await applyReviewedCatalogs({ env: { VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: 'test-only' },
    connect: async () => ({ query: db.query.bind(db), exec: db.exec.bind(db), close: async () => { closed = true; } }) });
  assert.equal(closed, true);
  assert.equal(result.campusResults[0].changes.length, 10);
  const edit = await exportPlaces(db, 'ustb-library');
  edit.places[0].description = '发布后人工维护';
  await importPlaces(db, edit, { apply: true });
  await setPlaceStatus(db, 'ustb-gymnasium', 1, 'archived', { apply: true });
  const replay = await applyCampusCatalogs(db);
  assert.equal(replay[0].alreadyApplied, true);
  assert.equal((await repository.campus('ustb', { ids: ['ustb-library'] })).places[0].description, '发布后人工维护');
  assert.equal((await repository.campus('ustb', { ids: ['ustb-gymnasium'] })).total, 0);
});
