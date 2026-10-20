import type { GlobalRoutePlan } from '../types';

type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 2000 && v.every((s) => typeof s === 'string');
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const textFields = (v: RecordValue, fields: string[]) => fields.every((key) => typeof v[key] === 'string');
const numbers = (v: RecordValue, fields: string[]) => fields.every((key) => number(v[key]));
const optionalStrings = (v: unknown) => v === undefined || strings(v);
function pace(v: unknown): boolean {
  return record(v) && ['easy', 'normal', 'packed'].includes(String(v.id)) && textFields(v, ['label', 'desc']) &&
    numbers(v, ['speed', 'dwell']) && (v.speed as number) > 0 && (v.dwell as number) > 0;
}
function place(v: unknown, city: boolean): boolean {
  return record(v) && textFields(v, ['id', 'name', 'emoji', 'short', 'description', 'bestTime']) &&
    number(v.visit) && strings(v.highlights) && strings(v.interests) &&
    (v.tips === undefined || typeof v.tips === 'string') &&
    (city ? textFields(v, ['district', 'districtId', 'category']) && numbers(v, ['lng', 'lat']) &&
      (v.lng as number) <= 180 && (v.lat as number) <= 90 : textFields(v, ['kind']) && numbers(v, ['x', 'y']));
}
function stop(v: unknown, city: boolean): boolean {
  if (!record(v) || !place(v[city ? 'place' : 'spot'], city) || !numbers(v, ['arrive', 'leave']) ||
    (v.leave as number) < (v.arrive as number) || typeof v.reason !== 'string') return false;
  if (!city) return numbers(v, ['walkMinutes', 'walkMeters']);
  return numbers(v, ['travelMinutes', 'distanceKm']) && ['步行', '公共交通'].includes(String(v.travelMode)) &&
    ['amap', 'estimate'].includes(String(v.routeProvider)) &&
    (v.routePath === undefined || Array.isArray(v.routePath) && v.routePath.every((p) =>
      Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n))));
}

/** 验证渲染和编辑所用字段；只迁移已知的无 kind 校园旧格式，不猜测未知版本。 */
export function decodeStoredGlobalRoute(value: unknown): GlobalRoutePlan | undefined {
  if (!record(value) || !record(value.plan) || !record(value.options)) return undefined;
  const kind = value.kind ?? 'campus';
  if (!['campus', 'beijing'].includes(String(kind))) return undefined;
  const city = kind === 'beijing';
  const p = value.plan;
  const o = value.options;
  if (!['manual', 'agent'].includes(String(value.source)) || typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt)) || !textFields(p, ['title', 'subtitle', 'remainingAdvice']) ||
    !place(p.origin, city) || !pace(p.pace) || !strings(p.matchedInterests) ||
    !numbers(p, ['remainingMinutes', 'totalMinutes', city ? 'totalDistanceKm' : 'totalMeters']) ||
    ![p.stops, p.optionalStops].every((items) => Array.isArray(items) && items.length <= 100 && items.every((s) => stop(s, city))) ||
    !strings(o.interests) || !pace(o.pace) || !number(o.minutes) || o.minutes <= 0) return undefined;
  if (city) {
    if (p.kind !== 'beijing' || !['estimate', 'amap', 'hybrid'].includes(String(p.routeProvider)) ||
      (p.routeNotice !== undefined && typeof p.routeNotice !== 'string') ||
      o.scope !== 'beijing' || !strings(o.districtIds) || !['walk', 'mixed', 'transit'].includes(String(o.travelMode)) ||
      !optionalStrings(o.includePlaceIds) || !optionalStrings(o.excludePlaceIds) ||
      (o.startPlaceId !== undefined && typeof o.startPlaceId !== 'string') ||
      (o.preserveSelectedStops !== undefined && typeof o.preserveSelectedStops !== 'boolean') ||
      (o.startHour !== undefined && (!number(o.startHour) || o.startHour >= 24))) return undefined;
  } else if (typeof o.startId !== 'string' || !optionalStrings(o.includeSpotIds) || !optionalStrings(o.excludeSpotIds) ||
    (o.campusId !== undefined && typeof o.campusId !== 'string') ||
    (o.campusLabel !== undefined && typeof o.campusLabel !== 'string')) return undefined;
  return { ...value, kind } as unknown as GlobalRoutePlan;
}

/** 解析失败或合法 JSON 的类型错误均只恢复当前键；其他收藏、清单和计划互不影响。 */
export function restoreStoredValue<T>(raw: string | null, fallback: T, decode?: (value: unknown) => T | undefined): T {
  if (raw === null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (decode) return decode(value) ?? fallback;
    if (Array.isArray(fallback)) return (strings(value) ? value : fallback) as T;
    return value !== null && typeof value === typeof fallback ? value as T : fallback;
  } catch { return fallback; }
}
