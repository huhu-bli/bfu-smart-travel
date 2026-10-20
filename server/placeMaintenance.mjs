import { PlaceValidationError, validateImport } from './placeValidation.mjs';

const columns = ['id', 'scope', 'campus_id', 'district_id', 'name', 'aliases', 'category', 'emoji',
  'lng', 'lat', 'map_x', 'map_y', 'visit_minutes', 'short', 'description', 'highlights', 'best_time',
  'tips', 'must_see', 'opening_hours', 'booking_url', 'address', 'ticket_note', 'coordinate_system'];
const valuesOf = (p) => [p.id, p.scope, p.campusId ?? null, p.districtId ?? null, p.name, p.aliases,
  p.category, p.emoji, p.lng ?? null, p.lat ?? null, p.x ?? null, p.y ?? null, p.visit, p.short,
  p.description, p.highlights, p.bestTime, p.tips, p.mustSee, p.openingHours, p.bookingUrl,
  p.address, p.ticketNote, p.coordinateSystem ?? 'unknown'];
const invalid = (message) => { throw new PlaceValidationError(message); };

// db 必须是独占连接（pg.Client 或 PGlite），不能将事务分散给连接池。
async function transaction(db, work, apply) {
  await db.query('BEGIN');
  try {
    const result = await work();
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function placeSnapshot(db, id) {
  const { rows } = await db.query(`SELECT p.*,
    ARRAY(SELECT tag_id FROM place_tags WHERE place_id=p.id ORDER BY tag_id) AS interests,
    COALESCE((SELECT json_agg(s ORDER BY s.reference) FROM place_sources s WHERE s.place_id=p.id), '[]'::json) AS sources
    FROM places p WHERE p.id=$1`, [id]);
  return rows[0] ?? null;
}

function editable(row) {
  const common = { operation: 'update', expectedVersion: row.version, id: row.id, scope: row.scope,
    name: row.name, aliases: row.aliases, category: row.category, emoji: row.emoji,
    visit: row.visit_minutes, short: row.short, description: row.description,
    highlights: row.highlights, interests: row.interests, bestTime: row.best_time, tips: row.tips,
    mustSee: row.must_see, openingHours: row.opening_hours, bookingUrl: row.booking_url,
    address: row.address, ticketNote: row.ticket_note,
    sources: row.sources.map((s) => ({ reference: s.reference, kind: s.source_kind,
      verificationStatus: s.verification_status,
      verifiedAt: s.verified_at ? new Date(s.verified_at).toISOString().slice(0, 10) : null })) };
  return row.scope === 'city'
    ? { ...common, districtId: row.district_id, lng: row.lng, lat: row.lat, coordinateSystem: row.coordinate_system }
    : { ...common, campusId: row.campus_id, x: row.map_x, y: row.map_y };
}

async function revision(db, snapshot, action, actor) {
  await db.query(`INSERT INTO place_revisions(place_id,version,action,actor,snapshot)
    VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (place_id,version) DO NOTHING`,
  [snapshot.id, snapshot.version, action, actor, JSON.stringify(snapshot)]);
}
function actorName(actor) {
  if (typeof actor !== 'string' || !actor.trim() || actor.length > 100) invalid('维护者名称必须是 1–100 字的文本。');
  return actor.trim();
}
async function referencesExist(db, p) {
  const ref = p.scope === 'city'
    ? await db.query('SELECT id FROM districts WHERE id=$1', [p.districtId])
    : await db.query('SELECT id FROM campuses WHERE id=$1', [p.campusId]);
  if (!ref.rows.length) invalid(`${p.id}：行政区或校园编号不存在，请先登记，不会自动创建。`);
  const tags = await db.query('SELECT id FROM tags WHERE id=ANY($1::text[])', [p.interests]);
  if (tags.rows.length !== p.interests.length) invalid(`${p.id}：兴趣标签尚未登记。`);
}
async function relations(db, p) {
  await db.query('DELETE FROM place_tags WHERE place_id=$1', [p.id]);
  await db.query('DELETE FROM place_sources WHERE place_id=$1', [p.id]);
  for (const tag of p.interests) await db.query('INSERT INTO place_tags(place_id,tag_id) VALUES($1,$2)', [p.id, tag]);
  for (const s of p.sources) await db.query(`INSERT INTO place_sources(place_id,reference,source_kind,verification_status,verified_at)
    VALUES($1,$2,$3,$4,$5)`, [p.id, s.reference, s.kind, s.verificationStatus, s.verifiedAt]);
}

export async function importPlaces(db, document, { apply = false, actor = 'maintainer' } = {}) {
  const records = validateImport(document).sort((a, b) => a.id.localeCompare(b.id));
  const by = actorName(actor);
  return transaction(db, async () => {
    const changes = [];
    for (const p of records) {
      await db.query('SELECT id FROM places WHERE id=$1 FOR UPDATE', [p.id]);
      const old = await placeSnapshot(db, p.id);
      if (p.operation === 'create' && old) invalid(`${p.id} 已存在；修改请导出最新版本后使用 update。`);
      if (p.operation === 'update') {
        if (!old) invalid(`${p.id} 不存在；新增请使用 create。`);
        if (old.version !== p.expectedVersion) invalid(`${p.id} 版本冲突：当前 ${old.version}，文件 ${p.expectedVersion}；请重新导出并核对修改。`);
        if (old.status !== 'active') invalid(`${p.id} 已归档，请先恢复。`);
        if (old.scope !== p.scope || old.campus_id !== (p.campusId ?? null)) invalid(`${p.id} 不能改变地点范围或所属校园；不同地点请使用新 id。`);
      }
      await referencesExist(db, p);
      if (old && JSON.stringify(valuesOf(p)) === JSON.stringify(valuesOf(editable(old))) &&
          JSON.stringify(p.interests) === JSON.stringify(old.interests) &&
          JSON.stringify(p.sources) === JSON.stringify(editable(old).sources)) {
        changes.push({ id: p.id, action: 'unchanged', version: old.version });
        continue;
      }
      const next = old ? old.version + 1 : 1;
      changes.push({ id: p.id, action: p.operation, version: next });
      // 预览执行同样的 SQL 和约束检查，但最终回滚，确保预览覆盖关联表。
      if (old) {
        await revision(db, old, 'baseline', by);
        const values = valuesOf(p);
        await db.query(`UPDATE places SET ${columns.slice(1).map((col, i) => `${col}=$${i + 2}`).join(',')}
          WHERE id=$1`, values);
      } else {
        await db.query(`INSERT INTO places(${columns.join(',')}) VALUES(${columns.map((_, i) => `$${i + 1}`).join(',')})`, valuesOf(p));
      }
      await relations(db, p);
      await revision(db, await placeSnapshot(db, p.id), p.operation, by);
    }
    return { applied: apply, changes };
  }, apply);
}

export async function exportPlaces(db, id) {
  return transaction(db, async () => {
    const { rows } = await db.query(`SELECT id FROM places WHERE status='active' ${id ? 'AND id=$1' : ''} ORDER BY id LIMIT 201`, id ? [id] : []);
    if (!rows.length) invalid('没有可导出的有效地点。');
    if (rows.length > 200) invalid('单文件最多 200 条，请用 --id 逐条导出维护。');
    const places = [];
    for (const row of rows) places.push(editable(await placeSnapshot(db, row.id)));
    return { schemaVersion: 1, places };
  }, false);
}

export async function setPlaceStatus(db, id, expectedVersion, status, { actor = 'maintainer', apply = false } = {}) {
  if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !['active', 'archived'].includes(status)) invalid('请提供地点 id、正整数 --version 和有效状态。');
  const by = actorName(actor);
  return transaction(db, async () => {
    await db.query('SELECT id FROM places WHERE id=$1 FOR UPDATE', [id]);
    const old = await placeSnapshot(db, id);
    if (!old) invalid('地点不存在。');
    if (old.version !== expectedVersion) invalid(`版本冲突：当前 ${old.version}，请先查看最新历史。`);
    if (old.status === status) return { applied: apply, id, action: 'unchanged', version: old.version };
    await revision(db, old, 'baseline', by);
    await db.query('UPDATE places SET status=$2 WHERE id=$1', [id, status]);
    const updated = await placeSnapshot(db, id);
    const action = status === 'archived' ? 'archive' : 'restore';
    await revision(db, updated, action, by);
    return { applied: apply, id, action, version: updated.version };
  }, apply);
}

export async function placeHistory(db, id) {
  const current = await placeSnapshot(db, id);
  const { rows } = await db.query(`SELECT version,action,actor,recorded_at AS "recordedAt",snapshot
    FROM place_revisions WHERE place_id=$1 ORDER BY version DESC`, [id]);
  return { id, currentVersion: current?.version ?? null, status: current?.status ?? null, revisions: rows };
}

export async function checkDataQuality(db) {
  const { rows } = await db.query(`SELECT count(*)::int AS total,
    count(*) FILTER(WHERE status='active')::int AS active,
    count(*) FILTER(WHERE status='archived')::int AS archived,
    count(*) FILTER(WHERE status='active' AND address='')::int AS "missingAddress",
    count(*) FILTER(WHERE status='active' AND (opening_hours IS NULL OR opening_hours=''))::int AS "missingOpeningHours",
    count(*) FILTER(WHERE status='active' AND scope='city' AND coordinate_system='unknown')::int AS "unknownCoordinates",
    count(*) FILTER(WHERE status='active' AND NOT EXISTS(SELECT 1 FROM place_sources s WHERE s.place_id=places.id AND s.verification_status='verified'))::int AS "withoutVerifiedSource"
    FROM places`);
  const duplicates = await db.query(`SELECT scope,campus_id AS "campusId",district_id AS "districtId",lower(trim(name)) AS name,array_agg(id ORDER BY id) AS ids
    FROM places WHERE status='active' GROUP BY scope,campus_id,district_id,lower(trim(name)) HAVING count(*)>1`);
  return { ...rows[0], possibleDuplicates: duplicates.rows };
}
