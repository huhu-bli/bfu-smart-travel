import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../database/migrate.mjs';
import { seedPlaces } from '../database/seed.ts';
import { importPlaces, exportPlaces, placeHistory, checkDataQuality } from '../server/placeMaintenance.mjs';
import { parsePlaceQuery, queryPlaces } from '../server/placeQueries.mjs';
import { applyReviewedCatalogs } from '../scripts/apply-reviewed-catalogs.mjs';
import { wgs84ToGcj02 } from '../scripts/support/wgs84-gcj02.mjs';

const read = async (name) => JSON.parse(await readFile(new URL(`../database/catalogs/${name}`, import.meta.url), 'utf8'));
const db = new PGlite();
after(async () => { await db.close(); });
const document = await read('beijing-reviewed-2026-10-22.json');
const batch = { id: 'beijing-reviewed-2026-10-22', checksum: createHash('sha256')
  .update(await readFile(new URL('../database/catalogs/beijing-reviewed-2026-10-22.json', import.meta.url))).digest('hex') };

test('reviewed facts and reference coordinates reach real queries and retain baseline history', async () => {
  await migrate(db); await seedPlaces(db);
  await importPlaces(db, await read('beijing-common-travel.json'), { apply: true });
  let closed = false;
  const release = async () => { closed = true; };
  const applied = await applyReviewedCatalogs({ env: { VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: 'test-only' },
    connect: async () => ({ query: db.query.bind(db), exec: db.exec.bind(db), close: release }) });
  assert.equal(closed, true);
  assert.equal(applied.skipped, false);
  const result = applied.results[0];
  assert.equal(result.changes.length, 22);
  assert.ok(result.changes.every((p) => p.version === 2));
  const quality = await checkDataQuality(db);
  assert.equal(quality.active, 105);
  assert.equal(quality.withoutVerifiedSource, 86);
  assert.equal(quality.unknownCoordinates, 35);
  const all = await queryPlaces(db, parsePlaceQuery(new URLSearchParams({ scope: 'city', limit: '100' })));
  assert.equal(all.total, 67);
  assert.equal(applied.results.length, 2);
  assert.equal(applied.results[1].changes.length, 15);
  assert.ok(applied.results[1].changes.every((p) => p.version === 3));
  assert.equal(all.places.filter((p) => p.ticketPrice).length, 15);
  assert.deepEqual(all.places.find((p) => p.id === 'forbidden-city').ticketPrice,
    { currency: 'CNY', min: 40, max: 60, basis: '成人大门票，淡旺季区间；珍宝馆、钟表馆另购' });
  assert.equal(all.places.find((p) => p.id === 'national-museum').ticketPrice.max, 0);
  assert.equal(all.places.find((p) => p.id === 'capital-museum').ticketPrice, null);
  assert.equal(all.places.filter((p) => p.openingHours).length, 19);
  const capital = all.places.find((p) => p.id === 'capital-museum');
  assert.match(capital.openingHours, /10月19日至23日/);
  assert.match(capital.openingHours, /每周二闭馆/);
  assert.ok(capital.sources.some((s) => s.verifiedAt === '2026-10-22'));
  const provenance = await read('beijing-reviewed-2026-10-22.provenance.json');
  for (const c of provenance.coordinates) {
    const p = all.places.find((p) => p.id === c.id);
    const [lng, lat] = wgs84ToGcj02(c.longitude, c.latitude);
    assert.equal(p.coordinateSystem, 'gcj02');
    assert.equal(p.lng, Number(lng.toFixed(6)));
    assert.equal(p.lat, Number(lat.toFixed(6)));
  }
  assert.ok(all.places.find((p) => p.id === 'grand-canal-museum').lat < 39.9);
  assert.deepEqual((await placeHistory(db, 'forbidden-city')).revisions.map((r) => r.action), ['update', 'update', 'baseline']);
});

test('batch replay preserves later manual edits; edited batches and conflicts cannot partially apply', async () => {
  const edited = await exportPlaces(db, 'forbidden-city');
  const ticketBatchText = await readFile(new URL('../database/catalogs/beijing-ticket-prices-2026-10-23.json', import.meta.url), 'utf8');
  const ticketBatch = { id: 'beijing-ticket-prices-2026-10-23', checksum: createHash('sha256').update(ticketBatchText).digest('hex') };
  assert.equal((await importPlaces(db, JSON.parse(ticketBatchText), { apply: true, batch: ticketBatch })).alreadyApplied, true);
  assert.equal(edited.places[0].expectedVersion, 3);
  assert.equal(edited.places[0].ticketPrice.max, 60);
  edited.places[0].tips = '后续人工维护的出行提示';
  await importPlaces(db, edited, { apply: true });
  assert.equal((await importPlaces(db, document, { apply: true, batch })).alreadyApplied, true);
  assert.equal((await exportPlaces(db, 'forbidden-city')).places[0].tips, '后续人工维护的出行提示');
  await assert.rejects(importPlaces(db, document, { apply: true, batch: { ...batch, checksum: 'a'.repeat(64) } }), /不能修改/);
  const before = await placeHistory(db, 'aosen');
  const conflicting = await exportPlaces(db);
  const aosen = conflicting.places.find((p) => p.id === 'aosen');
  aosen.tips = '这项变更必须随整批失败回滚';
  const last = conflicting.places.find((p) => p.id === 'zizhuyuan-park');
  last.expectedVersion = 1;
  await assert.rejects(importPlaces(db, { schemaVersion: 1, places: [aosen, last] }, { apply: true, batch: { ...batch, id: 'conflict-batch' } }), /版本冲突/);
  assert.deepEqual(await placeHistory(db, 'aosen'), before);
  assert.equal((await db.query("SELECT id FROM catalog_batches WHERE id='conflict-batch'")).rows.length, 0);
});

test('only an explicitly identified production build can open a database', async () => {
  const connect = () => { throw new Error('must not connect'); };
  for (const env of [{}, { VERCEL: '1', VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production', DATABASE_URL: 'test' }]) {
    assert.deepEqual(await applyReviewedCatalogs({ env, connect }), { skipped: true });
  }
  await assert.rejects(applyReviewedCatalogs({ env: { VERCEL: '1', VERCEL_ENV: 'production' }, connect }), /缺少 DATABASE_URL/);
});
