import { DEFAULT_AGENT_SETTINGS } from '../agent/config';
import type { BeijingPlace, Spot } from '../types';

export interface PlaceSource {
  reference: string;
  kind: 'project-import' | 'official' | 'manual';
  verificationStatus: 'unverified' | 'verified';
  verifiedAt: string | null;
}
export interface PlaceMetadata {
  version?: number;
  address?: string;
  ticketNote?: string;
  coordinateSystem?: 'unknown' | 'gcj02';
  aliases?: string[];
  updatedAt?: string;
  openingHours?: string | null;
  bookingUrl?: string | null;
  sources?: PlaceSource[];
}
export type CatalogCityPlace = BeijingPlace & PlaceMetadata;
export type CatalogSpot = Spot & PlaceMetadata;
export interface PlaceFilters {
  keyword?: string;
  districtIds?: string[];
  interests?: string[];
  ids?: string[];
  category?: string;
  limit?: number;
  offset?: number;
}
export interface PlacePage<T> {
  source: 'database';
  total: number;
  places: T[];
  limit: number;
  offset: number;
}
export interface PlaceRepository {
  city(filters?: PlaceFilters): Promise<PlacePage<CatalogCityPlace>>;
  campus(campusId: string, filters?: PlaceFilters): Promise<PlacePage<CatalogSpot>>;
}
export class PlaceDatabaseError extends Error {
  constructor(message: string) { super(message); this.name = 'PlaceDatabaseError'; }
}

function placesEndpoint(): string {
  // 本地 Vite 将 /api/places 转给本地数据库服务；其他静态站点沿用既有服务端地址。
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) return '/api/places';
  return DEFAULT_AGENT_SETTINGS.proxyUrl.replace(/\/+$/, '') + '/places';
}

async function requestPlaces<T>(scope: 'city' | 'campus', filters: PlaceFilters, campusId?: string): Promise<PlacePage<T>> {
  const params = new URLSearchParams({ scope, limit: String(filters.limit ?? 20), offset: String(filters.offset ?? 0) });
  if (campusId) params.set('campus_id', campusId);
  if (filters.keyword?.trim()) params.set('q', filters.keyword.trim());
  if (filters.category) params.set('category', filters.category);
  filters.districtIds?.forEach((id) => params.append('district_id', id));
  filters.interests?.forEach((id) => params.append('interest', id));
  filters.ids?.forEach((id) => params.append('id', id));
  try {
    const response = await fetch(placesEndpoint() + '?' + params, { signal: AbortSignal.timeout(12000) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.source !== 'database' || !Array.isArray(payload.places)) {
      throw new PlaceDatabaseError(typeof payload?.error === 'string' ? payload.error : '景点数据库查询失败，请稍后重试。');
    }
    return payload as PlacePage<T>;
  } catch (error) {
    if (error instanceof PlaceDatabaseError) throw error;
    throw new PlaceDatabaseError('无法连接景点数据库服务，请稍后重试。');
  }
}

export const databasePlaces: PlaceRepository = {
  city: (filters = {}) => requestPlaces<CatalogCityPlace>('city', filters),
  campus: (campusId, filters = {}) => requestPlaces<CatalogSpot>('campus', filters, campusId),
};

/** 规划只读取有限候选集合，并补齐用户明确指定的地点，不把全库塞进模型。 */
export async function cityPlanningPlaces(repository: PlaceRepository, districtIds: string[], includeIds: string[] = []) {
  const first = await repository.city({ districtIds, limit: 100 });
  const places = [...first.places];
  if (first.total > 100) places.push(...(await repository.city({ districtIds, offset: 100, limit: 100 })).places);
  const missing = includeIds.filter((id) => !places.some((place) => place.id === id));
  if (missing.length) places.push(...(await repository.city({ ids: missing.slice(0, 100), districtIds, limit: 100 })).places);
  return Array.from(new Map(places.map((place) => [place.id, place])).values());
}

export function matchingCityPlaces(text: string, places: CatalogCityPlace[]) {
  return places.filter((place) => [place.name, ...(place.aliases ?? [])].some((alias) => alias && text.includes(alias)));
}
