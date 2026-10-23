import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../database/migrate.mjs';
import { seedPlaces } from '../database/seed.ts';
import { validateImport } from '../server/placeValidation.mjs';
import { checkDataQuality, exportPlaces, importPlaces, placeHistory, placeSnapshot, setPlaceStatus } from '../server/placeMaintenance.mjs';
import { parsePlaceQuery, queryPlaces } from '../server/placeQueries.mjs';

const db = new PGlite();
const ready = (async () => { await migrate(db); await seedPlaces(db); })();
after(async () => { await ready; await db.close(); });
const doc = (...places) => ({ schemaVersion: 1, places });
const place = (id = 'maintenance-test') => ({ operation: 'create', id, scope: 'city',
  districtId: 'haidian', name: '仅用于维护测试的地点', category: 'restaurant',
  lng: 116.3, lat: 39.9, coordinateSystem: 'gcj02', visit: 40, interests: ['food'],
  address: '测试地址', ticketNote: '测试信息', openingHours: '测试开放说明',
  sources: [{ kind: 'manual', reference: 'integration-test', verificationStatus: 'unverified' }] });
const search = async (id) => queryPlaces(db, parsePlaceQuery(new URLSearchParams({ id })));

test('maintenance validation rejects malformed coordinates, untrusted links, invalid provenance and duplicate ids', () => {
  const invalid = [
    { ...place(), lng: 181 }, { ...place(), lat: '39.9' }, { ...place(), coordinateSystem: 'wgs84' },
    { ...place(), campusId: 'bfu' }, { ...place(), category: '随意分类' },
    { ...place(), interests: ['nonexistent'] }, { ...place(), visit: 1.5 },
    { ...place(), bookingUrl: 'javascript:alert(1)' },
    { ...place(), bookingUrl: 'https://user:password@example.com' },
    { ...place(), sql: 'DELETE FROM places' }, { ...place(), sources: [] },
    { ...place(), sources: [{ kind: 'official', reference: 'not-a-url' }] },
    { ...place(), sources: [{ kind: 'official', reference: 'https://example.com', verificationStatus: 'verified' }] },
    { ...place(), sources: [{ kind: 'manual', reference: 'test', verificationStatus: 'verified', verifiedAt: '2026-02-30' }] },
    { ...place(), sources: [{ kind: 'manual', reference: 'test', verificationStatus: 'verified', verifiedAt: '2999-01-01' }] },
  ];
  for (const record of invalid) assert.throws(() => validateImport(doc(record)), { name: 'PlaceValidationError' });
  assert.throws(() => validateImport(doc(place(), place())), /重复/);
  assert.throws(() => validateImport(doc({ ...place(), operation: 'update' })), /expectedVersion/);
  assert.equal(validateImport(doc(place()))[0].interests[0], 'food');
});

test('dry-run validates real database references and rolls back records, sources and revisions', async () => {
  await ready;
  const initial = await checkDataQuality(db);
  assert.equal(initial.total, 86);
  assert.equal(initial.withoutVerifiedSource, 86);
  const preview = await importPlaces(db, doc(place()));
  assert.equal(preview.applied, false);
  assert.equal(preview.changes[0].action, 'create');
  assert.equal(await placeSnapshot(db, 'maintenance-test'), null);
  assert.deepEqual((await placeHistory(db, 'maintenance-test')).revisions, []);
  await assert.rejects(importPlaces(db, doc({ ...place(), districtId: 'missing-district' })), /编号不存在/);
  assert.equal((await checkDataQuality(db)).total, 86);
});

test('applied import is immediately queryable, exported edits preserve sources and optimistic versions stop lost updates', async () => {
  await ready;
  await importPlaces(db, doc(place()), { apply: true, actor: 'test-maintainer' });
  const result = (await search('maintenance-test')).places[0];
  assert.equal(result.category, 'restaurant');
  assert.equal(result.address, '测试地址');
  assert.equal(result.coordinateSystem, 'gcj02');
  assert.equal(result.version, 1);
  assert.ok((await queryPlaces(db, parsePlaceQuery(new URLSearchParams({ q: '测试地址' })))).places.some((p) => p.id === 'maintenance-test'));
  const exported = await exportPlaces(db, 'maintenance-test');
  assert.equal(validateImport(exported).length, 1);
  const unchanged = await importPlaces(db, exported, { apply: true });
  assert.equal(unchanged.changes[0].action, 'unchanged');
  const edit = structuredClone(exported);
  edit.places[0].name = '修订后的测试地点';
  edit.places[0].interests = ['food', 'photo'];
  edit.places[0].sources = [{ kind: 'official', reference: 'https://example.com/test-only',
    verificationStatus: 'verified', verifiedAt: '2020-01-01' }];
  const preview = await importPlaces(db, edit);
  assert.equal(preview.changes[0].version, 2);
  assert.equal((await placeSnapshot(db, 'maintenance-test')).version, 1);
  await importPlaces(db, edit, { apply: true, actor: 'editor' });
  await assert.rejects(importPlaces(db, exported, { apply: true }), /版本冲突/);
  assert.equal((await search('maintenance-test')).places[0].name, '修订后的测试地点');
  const history = await placeHistory(db, 'maintenance-test');
  assert.deepEqual(history.revisions.map((r) => r.action), ['update', 'create']);
  assert.equal(history.revisions[0].actor, 'editor');
  assert.deepEqual(history.revisions[0].snapshot.interests, ['food', 'photo']);
  assert.equal(history.revisions[0].snapshot.sources[0].verification_status, 'verified');
  assert.equal(history.revisions[1].snapshot.sources[0].verification_status, 'unverified');
  assert.equal((await checkDataQuality(db)).withoutVerifiedSource, 86);
});

test('a later batch failure rolls back every earlier row and history entry', async () => {
  await ready;
  const edit = (await exportPlaces(db, 'maintenance-test')).places[0];
  await assert.rejects(importPlaces(db, doc(place('a-rolled-back'), { ...edit, expectedVersion: 1 }), { apply: true }), /版本冲突/);
  assert.equal(await placeSnapshot(db, 'a-rolled-back'), null);
  assert.deepEqual((await placeHistory(db, 'a-rolled-back')).revisions, []);
});

test('archive and restore are versioned and reversible, and archived places disappear from public search', async () => {
  await ready;
  await setPlaceStatus(db, 'maintenance-test', 2, 'archived');
  assert.equal((await search('maintenance-test')).total, 1);
  await setPlaceStatus(db, 'maintenance-test', 2, 'archived', { apply: true });
  assert.equal((await search('maintenance-test')).total, 0);
  await assert.rejects(exportPlaces(db, 'maintenance-test'), /没有可导出/);
  await assert.rejects(setPlaceStatus(db, 'maintenance-test', 2, 'active', { apply: true }), /版本冲突/);
  await setPlaceStatus(db, 'maintenance-test', 3, 'active', { apply: true });
  assert.equal((await search('maintenance-test')).total, 1);
  const history = await placeHistory(db, 'maintenance-test');
  assert.equal(history.currentVersion, 4);
  assert.deepEqual(history.revisions.map((r) => r.action), ['restore', 'archive', 'update', 'create']);
  assert.equal(history.revisions[1].snapshot.status, 'archived');
});

test('all seed records export into validated inputs; first edit retains the baseline and seed replay preserves edits', async () => {
  await ready;
  const exported = await exportPlaces(db);
  assert.equal(validateImport(exported).length, 87);
  const record = exported.places.find((p) => p.id === 'forbidden-city');
  const before = record.description;
  record.description = '人工维护介绍';
  await importPlaces(db, doc(record), { apply: true });
  const history = await placeHistory(db, 'forbidden-city');
  assert.deepEqual(history.revisions.map((r) => r.action), ['update', 'baseline']);
  assert.equal(history.revisions[1].snapshot.description, before);
  await seedPlaces(db);
  await migrate(db);
  assert.equal((await placeSnapshot(db, 'forbidden-city')).description, '人工维护介绍');
});

test('campus edits cannot repurpose a point as another campus or city destination', async () => {
  await ready;
  const campus = (await exportPlaces(db)).places.find((p) => p.scope === 'campus' && p.campusId === 'bjtu');
  await assert.rejects(importPlaces(db, doc({ ...campus, campusId: 'bfu' }), { apply: true }), /所属校园/);
  const city = { ...place(campus.id), operation: 'update', expectedVersion: campus.expectedVersion };
  await assert.rejects(importPlaces(db, doc(city), { apply: true }), /地点范围/);
  assert.equal((await placeSnapshot(db, campus.id)).campus_id, 'bjtu');
});

test('structured ticket prices round-trip through SQL and exports; invalid prices fail application and database constraints', async () => {
  await ready;
  const price = { currency: 'CNY', min: 10.25, max: 30, basis: '普通成人票，其他项目另计' };
  await importPlaces(db, doc({ ...place('ticket-roundtrip'), ticketPrice: price }), { apply: true });
  assert.deepEqual((await search('ticket-roundtrip')).places[0].ticketPrice, price);
  const exported = await exportPlaces(db, 'ticket-roundtrip');
  assert.deepEqual(exported.places[0].ticketPrice, price);
  assert.equal((await importPlaces(db, exported, { apply: true })).changes[0].action, 'unchanged');
  const bad = [{ ...price, min: -1 }, { ...price, max: 0 }, { ...price, max: '30' }, { ...price, min: 1.001 }, { ...price, currency: 'USD' }, { ...price, basis: '' }, { ...price, min: null }, { ...price, foo: 1 }];
  for (const ticketPrice of bad) assert.throws(() => validateImport(doc({ ...place('bad-ticket'), ticketPrice })), { name: 'PlaceValidationError' });
  for (const ticketPrice of bad.slice(0, -1)) {
    await assert.rejects(db.query('UPDATE places SET ticket_price=$1 WHERE id=$2', [JSON.stringify(ticketPrice), 'ticket-roundtrip']));
  }
  assert.equal((await search('ticket-roundtrip')).places[0].version, 1);
  exported.places[0].ticketPrice = null;
  await importPlaces(db, exported, { apply: true });
  assert.equal((await search('ticket-roundtrip')).places[0].ticketPrice, null);
  assert.deepEqual((await placeHistory(db, 'ticket-roundtrip')).revisions[1].snapshot.ticket_price, price);
});
