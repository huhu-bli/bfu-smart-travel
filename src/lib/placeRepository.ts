import { DEFAULT_AGENT_SETTINGS } from '../agent/config';
import type { BeijingPlace, Spot, TicketPrice } from '../types';

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
  ticketPrice?: TicketPrice | null;
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
  city(filters?: PlaceFilters, signal?: AbortSignal): Promise<PlacePage<CatalogCityPlace>>;
  campus(campusId: string, filters?: PlaceFilters, signal?: AbortSignal): Promise<PlacePage<CatalogSpot>>;
}
export class PlaceDatabaseError extends Error {
  constructor(message: string) { super(message); this.name = 'PlaceDatabaseError'; }
}

function placesEndpoint(): string {
  // 本地 Vite 将 /api/places 转给本地数据库服务；其他静态站点沿用既有服务端地址。
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) return '/api/places';
  return DEFAULT_AGENT_SETTINGS.proxyUrl.replace(/\/+$/, '') + '/places';
}

async function requestPlaces<T>(scope: 'city' | 'campus', filters: PlaceFilters, campusId?: string, signal?: AbortSignal): Promise<PlacePage<T>> {
  const params = new URLSearchParams({ scope, limit: String(filters.limit ?? 20), offset: String(filters.offset ?? 0) });
  if (campusId) params.set('campus_id', campusId);
  if (filters.keyword?.trim()) params.set('q', filters.keyword.trim());
  if (filters.category) params.set('category', filters.category);
  filters.districtIds?.forEach((id) => params.append('district_id', id));
  filters.interests?.forEach((id) => params.append('interest', id));
  filters.ids?.forEach((id) => params.append('id', id));
  // 两次尝试共用超时预算；取消筛选、切页或离开页面后不再重试旧请求。
  // Safari 13–16 不一定提供 AbortSignal.any/timeout/reason/throwIfAborted。
  // 用基础 AbortController 合并取消与超时，并在请求结束后释放监听和定时器。
  const controller = new AbortController();
  const combined = controller.signal;
  const abortReason = () => signal?.reason ?? new DOMException('请求已取消。', 'AbortError');
  const cancel = () => controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const pause = () => new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); combined.removeEventListener('abort', abort); reject(abortReason()); };
    const timer = setTimeout(() => { combined.removeEventListener('abort', abort); resolve(); }, 300);
    if (combined.aborted) abort();
    else combined.addEventListener('abort', abort, { once: true });
  });
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (combined.aborted) throw abortReason();
        const response = await fetch(placesEndpoint() + '?' + params, { signal: combined });
        if (attempt === 0 && [502, 503, 504].includes(response.status)) {
          await response.body?.cancel();
          await pause();
          continue;
        }
        const payload = await response.json().catch(() => null);
        if (combined.aborted) throw abortReason();
        if (!response.ok || payload?.source !== 'database' || !Array.isArray(payload.places)) {
          throw new PlaceDatabaseError(typeof payload?.error === 'string' ? payload.error : '景点数据库查询失败，请稍后重试。');
        }
        return payload as PlacePage<T>;
      } catch (error) {
        if (signal?.aborted) throw abortReason();
        if (!combined.aborted && attempt === 0 && error instanceof TypeError) {
          await pause();
          continue;
        }
        if (error instanceof PlaceDatabaseError) throw error;
        if (timedOut) throw new PlaceDatabaseError('景点数据库请求超时，请稍后重试。');
        throw new PlaceDatabaseError('无法连接景点数据库服务，请稍后重试。');
      }
    }
    throw new PlaceDatabaseError('景点数据库查询失败，请稍后重试。');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export const databasePlaces: PlaceRepository = {
  city: (filters = {}, signal) => requestPlaces<CatalogCityPlace>('city', filters, undefined, signal),
  campus: (campusId, filters = {}, signal) => requestPlaces<CatalogSpot>('campus', filters, campusId, signal),
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
