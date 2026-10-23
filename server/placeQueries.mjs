export class QueryValidationError extends Error {}

function boundedInteger(raw, fallback, min, max) {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new QueryValidationError('分页参数必须是整数。');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new QueryValidationError('分页参数超出范围。');
  return value;
}

export function parsePlaceQuery(params) {
  const allowed = new Set(['scope', 'campus_id', 'q', 'district_id', 'interest', 'category', 'id', 'limit', 'offset']);
  for (const key of params.keys()) if (!allowed.has(key)) throw new QueryValidationError('不支持的查询字段。');
  for (const key of ['scope', 'campus_id', 'q', 'category', 'limit', 'offset']) {
    if (params.getAll(key).length > 1) throw new QueryValidationError('查询字段不能重复。');
  }
  const scope = params.get('scope') || 'city';
  if (!['city', 'campus'].includes(scope)) throw new QueryValidationError('地点范围无效。');
  const campusId = params.get('campus_id') || '';
  if ((scope === 'campus' && !campusId) || (scope === 'city' && campusId)) throw new QueryValidationError('校园查询必须指定 campus_id，城市查询不能携带 campus_id。');
  const keyword = (params.get('q') || '').trim();
  if (keyword.length > 100) throw new QueryValidationError('关键词最多 100 字。');
  const category = params.get('category') || '';
  const districts = params.getAll('district_id');
  const interests = params.getAll('interest');
  const ids = params.getAll('id');
  if (districts.length > 16 || interests.length > 6 || ids.length > 100) throw new QueryValidationError('查询条件过多。');
  if ([campusId, category, ...districts, ...interests, ...ids].some((v) => v.length > 100)) throw new QueryValidationError('查询字段过长。');
  return { scope, campusId, keyword, category, districts, interests, ids,
    limit: boundedInteger(params.get('limit'), 20, 1, 100),
    offset: boundedInteger(params.get('offset'), 0, 0, 100000) };
}

export function buildPlaceQuery(filter) {
  const values = [];
  const bind = (value) => { values.push(value); return `$${values.length}`; };
  const where = ["p.status = 'active'", `p.scope = ${bind(filter.scope)}`];
  if (filter.campusId) where.push(`p.campus_id = ${bind(filter.campusId)}`);
  if (filter.category) where.push(`p.category = ${bind(filter.category)}`);
  if (filter.districts.length) where.push(`p.district_id = ANY(${bind(filter.districts)}::text[])`);
  if (filter.ids.length) where.push(`p.id = ANY(${bind(filter.ids)}::text[])`);
  if (filter.interests.length) where.push(`EXISTS (SELECT 1 FROM place_tags t WHERE t.place_id = p.id AND t.tag_id = ANY(${bind(filter.interests)}::text[]))`);
  if (filter.keyword) {
    const literal = filter.keyword.replace(/[\\%_]/g, '\\$&');
    const key = bind(`%${literal}%`);
    where.push(`(p.name ILIKE ${key} ESCAPE '\\' OR p.short ILIKE ${key} ESCAPE '\\'
      OR p.description ILIKE ${key} ESCAPE '\\' OR p.address ILIKE ${key} ESCAPE '\\' OR d.name ILIKE ${key} ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM unnest(p.aliases || p.highlights) term WHERE term ILIKE ${key} ESCAPE '\\'))`);
  }
  const condition = where.join(' AND ');
  const limit = bind(filter.limit);
  const offset = bind(filter.offset);
  // 聚合总数与分页结果在同一快照内完成，空页也返回真实总数。
  const text = `WITH matched AS (
    SELECT p.*, d.name AS district FROM places p LEFT JOIN districts d ON d.id = p.district_id WHERE ${condition}
  ), page AS (
    SELECT m.*,
      ARRAY(SELECT tag_id FROM place_tags WHERE place_id = m.id ORDER BY tag_id) AS interests,
      COALESCE((SELECT json_agg(s ORDER BY s.reference) FROM place_sources s WHERE s.place_id = m.id), '[]'::json) AS sources
    FROM matched m ORDER BY m.name, m.id LIMIT ${limit} OFFSET ${offset}
  ) SELECT (SELECT count(*)::int FROM matched) AS total,
    COALESCE((SELECT json_agg(page) FROM page), '[]'::json) AS places`;
  return { text, values };
}

function publicPlace(row) {
  const shared = {
    id: row.id, name: row.name, emoji: row.emoji, aliases: row.aliases,
    visit: row.visit_minutes, short: row.short, description: row.description,
    highlights: row.highlights, interests: row.interests, bestTime: row.best_time,
    tips: row.tips, mustSee: row.must_see, scope: row.scope,
    openingHours: row.opening_hours, bookingUrl: row.booking_url,
    updatedAt: row.updated_at, version: row.version,
    address: row.address, ticketNote: row.ticket_note, ticketPrice: row.ticket_price, coordinateSystem: row.coordinate_system,
    sources: row.sources.map((s) => ({ reference: s.reference, kind: s.source_kind,
      verificationStatus: s.verification_status,
      verifiedAt: s.verified_at ? new Date(s.verified_at).toISOString().slice(0, 10) : null })),
  };
  return row.scope === 'city'
    ? { ...shared, category: row.category, districtId: row.district_id, district: row.district, lng: row.lng, lat: row.lat }
    : { ...shared, kind: row.category, campusId: row.campus_id, x: row.map_x, y: row.map_y };
}

export async function queryPlaces(db, filter) {
  const query = buildPlaceQuery(filter);
  const { rows } = await db.query(query.text, query.values);
  return { source: 'database', total: rows[0].total, limit: filter.limit, offset: filter.offset,
    places: rows[0].places.map(publicPlace) };
}
