// 只供单元测试使用。生产环境的唯一景点仓储是 databasePlaces。
import { BEIJING_PLACES, aliasesForPlace } from '../../src/data/beijingPlaces';
import { campusById } from '../../src/data/campuses';
import type { PlaceFilters, PlaceRepository } from '../../src/lib/placeRepository';

function page<T extends { id: string; name: string; short: string; highlights: string[]; interests: string[] }>(places: T[], filters: PlaceFilters = {}) {
  const matched = places.filter((place) => (!filters.ids?.length || filters.ids.includes(place.id)) &&
    (!filters.interests?.length || place.interests.some((id) => filters.interests?.includes(id))) &&
    (!filters.keyword || [place.name, place.short, ...place.highlights].some((text) => text.includes(filters.keyword!))));
  const offset = filters.offset ?? 0, limit = filters.limit ?? 20;
  return { source: 'database' as const, total: matched.length, places: matched.slice(offset, offset + limit), offset, limit };
}
export const fixturePlaces: PlaceRepository = {
  city: async (filters = {}) => page(BEIJING_PLACES.filter((place) => !filters.districtIds?.length || filters.districtIds.includes(place.districtId))
    .map((place) => ({ ...place, aliases: aliasesForPlace(place) })), filters),
  campus: async (id, filters = {}) => page(campusById(id)?.spots ?? [], filters),
};
