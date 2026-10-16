import { BEIJING_DISTRICTS, BEIJING_PLACES, aliasesForPlace } from '../src/data/beijingPlaces';
import { CAMPUSES } from '../src/data/campuses';
import { INTERESTS } from '../src/data/interests';
import type { BeijingPlace, Spot } from '../src/types';

interface SeedDatabase {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export async function seedPlaces(db: SeedDatabase) {
  let inserted = 0;
  await db.query('BEGIN');
  try {
    for (const district of BEIJING_DISTRICTS) {
      await db.query('INSERT INTO districts(id, name, aliases) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [district.id, district.label, district.aliases]);
    }
    for (const campus of CAMPUSES) {
      await db.query('INSERT INTO campuses(id, name, aliases) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [campus.id, campus.name, campus.aliases]);
    }
    for (const tag of INTERESTS) {
      await db.query('INSERT INTO tags(id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [tag.id, tag.label]);
    }
    const insert = async (place: BeijingPlace | Spot, campusId: string | null, reference: string) => {
      const city = 'districtId' in place ? place : null;
      const spot = 'kind' in place ? place : null;
      const { rows } = await db.query(`INSERT INTO places
        (id, scope, campus_id, district_id, name, aliases, category, emoji, lng, lat, map_x, map_y,
         visit_minutes, short, description, highlights, best_time, tips, must_see)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (id) DO NOTHING RETURNING id`,
      [place.id, city ? 'city' : 'campus', campusId, city?.districtId ?? null, place.name,
        city ? aliasesForPlace(city) : [place.name], city?.category ?? spot!.kind, place.emoji,
        city?.lng ?? null, city?.lat ?? null, spot?.x ?? null, spot?.y ?? null, place.visit,
        place.short, place.description, place.highlights, place.bestTime, place.tips ?? '', place.mustSee ?? false]);
      // 再次导入不覆盖后续人工维护的景点、标签或来源。
      if (!rows.length) return;
      inserted += 1;
      for (const tagId of place.interests) {
        await db.query('INSERT INTO place_tags(place_id, tag_id) VALUES ($1, $2)', [place.id, tagId]);
      }
      await db.query(`INSERT INTO place_sources(place_id, reference, source_kind, verification_status)
        VALUES ($1, $2, 'project-import', 'unverified')`, [place.id, reference]);
    };
    for (const place of BEIJING_PLACES) await insert(place, null, 'src/data/beijingPlaces.ts');
    for (const campus of CAMPUSES) {
      for (const place of campus.spots ?? []) {
        await insert(place, campus.id, campus.id === 'bfu' ? 'src/data/spots.ts' : 'src/data/campuses/bjtu.ts');
      }
    }
    await db.query('COMMIT');
    return { inserted };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
