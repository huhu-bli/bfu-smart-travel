import type {
  AMapLngLatInstance,
  AMapNamespace,
  AMapRouteResult,
  AMapTransferPlan,
  AMapWalkingResult,
} from '../amapLoader';
import { loadAMap, readAmapRuntimeConfig } from '../amapLoader';
import type {
  BeijingPlace,
  BeijingRouteOptions,
  BeijingRoutePlan,
  BeijingRouteStop,
} from '../../types';

export interface AmapRouteMeasurement {
  minutes: number;
  distanceKm: number;
  path: Array<[number, number]>;
  mode: BeijingRouteStop['travelMode'];
}

type RouteMeasurement = AmapRouteMeasurement | null;

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function pointTuple(point: AMapLngLatInstance): [number, number] | null {
  const lng = finiteNumber(point.getLng?.() ?? point.lng);
  const lat = finiteNumber(point.getLat?.() ?? point.lat);
  return lng === null || lat === null ? null : [lng, lat];
}

function pathFromPoints(points: AMapLngLatInstance[]): Array<[number, number]> {
  return points.map(pointTuple).filter((point): point is [number, number] => point !== null);
}

function pathDistanceKm(path: Array<[number, number]>): number | null {
  if (path.length < 2) return null;
  const radiusKm = 6371;
  const radians = (value: number) => value * Math.PI / 180;
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const [lngA, latA] = path[index - 1];
    const [lngB, latB] = path[index];
    const latDelta = radians(latB - latA);
    const lngDelta = radians(lngB - lngA);
    const a = Math.sin(latDelta / 2) ** 2
      + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(lngDelta / 2) ** 2;
    total += radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(total * 10) / 10;
}

function secondsToMinutes(value: unknown): number | null {
  const seconds = finiteNumber(value);
  return seconds === null ? null : Math.max(1, Math.round(seconds / 60));
}

function metersToKm(value: unknown): number | null {
  const meters = finiteNumber(value);
  return meters === null ? null : Math.round((meters / 1000) * 10) / 10;
}

export function parseWalkingResult(result: AMapRouteResult): AmapRouteMeasurement | null {
  if (typeof result === 'string') return null;
  const route = (result as AMapWalkingResult).routes?.[0];
  if (!route) return null;
  const minutes = secondsToMinutes(route.time ?? route.duration);
  const distanceKm = metersToKm(route.distance);
  if (minutes === null || distanceKm === null) return null;
  const path = pathFromPoints((route.steps ?? []).flatMap((step) => step.path ?? []));
  return { minutes, distanceKm, path, mode: '步行' };
}

export function parseTransferResult(result: AMapRouteResult): AmapRouteMeasurement | null {
  if (typeof result === 'string') return null;
  const plan = (result as { plans?: AMapTransferPlan[] }).plans?.[0];
  if (!plan) return null;
  const minutes = secondsToMinutes(plan.time ?? plan.duration);
  const path = pathFromPoints((plan.segments ?? []).flatMap((segment) => segment.transit?.path ?? []));
  const explicitDistance = metersToKm(plan.distance);
  const distanceKm = explicitDistance ?? pathDistanceKm(path) ?? metersToKm(plan.walking_distance);
  if (minutes === null || distanceKm === null) return null;
  return { minutes, distanceKm, path, mode: '公共交通' };
}

function withTimeout<T>(operation: Promise<T>, timeoutMs = 7000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error('高德路线查询超时。')), timeoutMs);
    operation.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function searchLeg(
  AMap: AMapNamespace,
  from: BeijingPlace,
  to: BeijingPlace,
  mode: BeijingRouteStop['travelMode'],
): Promise<AmapRouteMeasurement> {
  const query = new Promise<AmapRouteMeasurement>((resolve, reject) => {
    const callback = (status: string, result: AMapRouteResult) => {
      const measurement = mode === '步行' ? parseWalkingResult(result) : parseTransferResult(result);
      if (status === 'complete' && measurement) resolve(measurement);
      else reject(new Error(typeof result === 'string' ? result : `高德${mode}路线没有返回可用结果。`));
    };
    if (mode === '步行') {
      new AMap.Walking().search([from.lng, from.lat], [to.lng, to.lat], callback);
      return;
    }
    new AMap.Transfer({
      city: '北京市',
      cityd: '北京市',
      nightflag: true,
      policy: AMap.TransferPolicy?.LEAST_TIME,
    }).search([from.lng, from.lat], [to.lng, to.lat], callback);
  });
  return withTimeout(query);
}

function fallbackPath(from: BeijingPlace, to: BeijingPlace): Array<[number, number]> {
  return [[from.lng, from.lat], [to.lng, to.lat]];
}

function updateStop(
  stop: BeijingRouteStop,
  measurement: RouteMeasurement,
  from: BeijingPlace,
  elapsed: number,
): BeijingRouteStop {
  const dwell = Math.max(0, stop.leave - stop.arrive);
  const travelMinutes = measurement?.minutes ?? stop.travelMinutes;
  const arrive = elapsed + travelMinutes;
  return {
    ...stop,
    arrive,
    leave: arrive + dwell,
    travelMinutes,
    distanceKm: measurement?.distanceKm ?? stop.distanceKm,
    travelMode: measurement?.mode ?? stop.travelMode,
    routeProvider: measurement ? 'amap' : 'estimate',
    routePath: measurement?.path.length ? measurement.path : fallbackPath(from, stop.place),
  };
}

export function applyAmapMeasurements(
  plan: BeijingRoutePlan,
  options: BeijingRouteOptions,
  primaryMeasurements: RouteMeasurement[],
  optionalMeasurements: RouteMeasurement[] = [],
): BeijingRoutePlan {
  const originDwell = plan.stops[0]
    ? plan.stops[0].arrive - plan.stops[0].travelMinutes
    : plan.totalMinutes;
  let elapsed = originDwell;
  let previous = plan.origin;
  let livePrimaryCount = 0;
  const stops = plan.stops.map((stop, index) => {
    const measurement = primaryMeasurements[index] ?? null;
    if (measurement) livePrimaryCount += 1;
    const next = updateStop(stop, measurement, previous, elapsed);
    elapsed = next.leave;
    previous = next.place;
    return next;
  });

  const optionalStops = plan.optionalStops.map((stop, index) =>
    updateStop(stop, optionalMeasurements[index] ?? null, previous, elapsed),
  );
  const totalDistanceKm = Math.round(stops.reduce((sum, stop) => sum + stop.distanceKm, 0) * 10) / 10;
  const routeProvider = livePrimaryCount === 0
    ? 'estimate'
    : livePrimaryCount === stops.length
      ? 'amap'
      : 'hybrid';
  const remainingMinutes = Math.max(0, Math.round(options.minutes - elapsed));
  const overrun = Math.max(0, Math.round(elapsed - options.minutes));
  const routeNotice = routeProvider === 'amap'
    ? '交通时间与道路轨迹来自高德路线服务，出发前仍需确认实时运营和临时管制。'
    : routeProvider === 'hybrid'
      ? '部分路段来自高德路线服务，查询失败的路段已自动使用本地估算。'
      : '高德路线暂不可用，已自动使用本地距离模型估算，不影响路线编辑。';

  return {
    ...plan,
    stops,
    optionalStops,
    totalMinutes: elapsed,
    totalDistanceKm,
    remainingMinutes,
    remainingAdvice: overrun
      ? `按高德交通时间计算，当前路线超出预算约 ${overrun} 分钟，建议删除一个站点或缩短停留时间。`
      : plan.totalMinutes > options.minutes
        ? `高德交通时间更新后还剩约 ${remainingMinutes} 分钟，可用于排队、休息或换乘。`
        : plan.remainingAdvice,
    subtitle: `${plan.pace.label}节奏 · ${1 + stops.length} 个目的地 · 点位间约 ${totalDistanceKm} 公里`,
    routeProvider,
    routeNotice,
  };
}

export async function refineBeijingRouteWithAmap(
  plan: BeijingRoutePlan,
  options: BeijingRouteOptions,
): Promise<BeijingRoutePlan> {
  const config = readAmapRuntimeConfig();
  if (!config.key || typeof document === 'undefined') return plan;
  try {
    const AMap = await loadAMap(config.key, config.proxyUrl);
    const primaryPairs = plan.stops.map((stop, index) => ({
      from: index === 0 ? plan.origin : plan.stops[index - 1].place,
      to: stop.place,
      mode: stop.travelMode,
    }));
    // 只查询已进入主线的路段；可选点加入主线后再查询，减少配额消耗。
    const settled = await Promise.allSettled(
      primaryPairs.map((leg) => searchLeg(AMap, leg.from, leg.to, leg.mode)),
    );
    const measurements = settled.map((item) => item.status === 'fulfilled' ? item.value : null);
    return applyAmapMeasurements(plan, options, measurements);
  } catch {
    return {
      ...plan,
      routeProvider: 'estimate',
      routeNotice: '高德路线暂不可用，已自动使用本地距离模型估算，不影响路线编辑。',
    };
  }
}

export async function buildBeijingRouteWithAmap(
  plan: BeijingRoutePlan,
  options: BeijingRouteOptions,
): Promise<BeijingRoutePlan> {
  return refineBeijingRouteWithAmap(plan, options);
}
