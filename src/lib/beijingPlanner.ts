import { budgetToText } from './tripBudget';
import { BEIJING_CATEGORY_LABELS } from '../data/beijingPlaces';
import { INTEREST_MAP } from '../data/interests';
import type {
  BeijingPlace,
  BeijingRouteOptions,
  BeijingRoutePlan,
  BeijingRouteStop,
  InterestId,
} from '../types';
import { formatDuration } from './planner';

const MAX_STOPS = 8;
const MAX_OPTIONAL_STOPS = 4;
const EARTH_RADIUS_KM = 6371;
export const ROUTE_AVAILABILITY_NOTICE = '本路线尚未校验出游日期、临时闭馆或预约余票；请逐站确认开放与预约后再出发。';

export function distanceKm(a: BeijingPlace, b: BeijingPlace): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDistance = toRadians(b.lat - a.lat);
  const lngDistance = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);
  const h =
    Math.sin(latDistance / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(lngDistance / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function transferEstimate(
  from: BeijingPlace,
  to: BeijingPlace,
  mode: BeijingRouteOptions['travelMode'],
  speedFactor: number,
): { minutes: number; mode: BeijingRouteStop['travelMode']; distance: number } {
  const straight = distanceKm(from, to);
  const roadDistance = straight * 1.28;
  const shouldWalk = mode === 'walk' || (mode === 'mixed' && roadDistance <= 2.2);
  if (shouldWalk) {
    const minutes = Math.max(5, Math.round((roadDistance / (4.8 * speedFactor)) * 60));
    return { minutes, mode: '步行', distance: roadDistance };
  }
  // 城市级规划使用稳定的启发式估算；地图导航负责提供当日精确换乘。
  const minutes = Math.max(18, Math.round(12 + (roadDistance / 22) * 60));
  return { minutes, mode: '公共交通', distance: roadDistance };
}

function dwellMinutes(
  place: BeijingPlace,
  options: BeijingRouteOptions,
  compactExplicit = false,
): number {
  const explicitFactor = compactExplicit ? 0.8 : 1;
  return Math.max(20, Math.round((place.visit * options.pace.dwell * explicitFactor) / 10) * 10);
}

function wantedInterests(interests: InterestId[]): InterestId[] {
  // 美食一日游还应有可逛的邻近地点，而不是排进一个占满全天的主题公园。
  return interests.length ? interests.includes('food') && interests.length === 1
    ? ['food', 'culture'] : interests : ['culture', 'plant', 'photo'];
}

function baseScore(place: BeijingPlace, wanted: InterestId[], included: Set<string>): number {
  const relevance = place.interests.filter((id) => wanted.includes(id)).length;
  const foodRoute = wanted.includes('food');
  const diningArea = foodRoute && place.interests.includes('food') && ['neighborhood', 'restaurant'].includes(place.category) ? 5 : 0;
  const fullDayAttraction = foodRoute && place.visit >= 360 ? 8 : 0;
  return relevance * 4 + (place.mustSee ? 2.5 : 0) + diningArea - fullDayAttraction + (included.has(place.id) ? 100 : 0);
}

function reasonFor(place: BeijingPlace, wanted: InterestId[]): string {
  const labels = place.interests
    .filter((id) => wanted.includes(id))
    .map((id) => INTEREST_MAP[id]?.label ?? id);
  const match = labels.length ? `匹配「${labels.join('、')}」` : BEIJING_CATEGORY_LABELS[place.category];
  return `${match}${place.mustSee ? ' · 北京代表性目的地' : ''} · ${place.short}`;
}

export function remainingAdvice(minutes: number, optionalStops: BeijingRouteStop[], elapsed: number): string {
  const fitting = optionalStops.filter((stop) => stop.leave - elapsed <= minutes);
  if (minutes < 20) return '当前时间基本排满，建议保留给排队、安检和换乘。';
  if (fitting.length) return `按当前交通与停留估算，可从${fitting.map((stop) => stop.place.name).join('、')}中选择 1 处；加入后请重新核对总时长。`;
  if (optionalStops.length) return '当前可选站点的交通与停留合计均超过剩余时间，建议留作休息、用餐或交通机动；增加预算后再加入。';
  return minutes < 120 ? '建议留作交通、休息和用餐机动。' : '剩余时间较多，可增加同区景点或安排餐饮休息。';
}

function routeTitle(planPlaces: BeijingPlace[], options: BeijingRouteOptions): string {
  const districts = Array.from(new Set(planPlaces.map((item) => item.district)));
  const scope = districts.length === 1 ? districts[0] : districts.length <= 3 ? districts.join('＋') : '北京全域';
  const interests = wantedInterests(options.interests)
    .slice(0, 2)
    .map((id) => INTEREST_MAP[id]?.label ?? id)
    .join('＋');
  return `${scope} · ${interests}路线`;
}

function availablePlaces(options: BeijingRouteOptions, places: BeijingPlace[]): BeijingPlace[] {
  const districts = new Set(options.districtIds);
  const excluded = new Set(options.excludePlaceIds ?? []);
  return places.filter(
    (item) => !excluded.has(item.id) && (!districts.size || districts.has(item.districtId)),
  );
}

export function buildBeijingRoute(options: BeijingRouteOptions, places: BeijingPlace[]): BeijingRoutePlan {
  const placeMap = Object.fromEntries(places.map((place) => [place.id, place]));
  const pool = availablePlaces(options, places);
  if (!pool.length) throw new Error('当前筛选条件没有可规划的北京点位。');

  const wanted = wantedInterests(options.interests);
  const included = new Set((options.includePlaceIds ?? []).filter((id) => placeMap[id]));
  const exactPlaces = options.preserveSelectedStops
    ? Array.from(new Set(options.includePlaceIds ?? []))
      .map((id) => placeMap[id])
      .filter((place): place is BeijingPlace => Boolean(place && pool.includes(place)))
    : [];
  if (options.preserveSelectedStops && !exactPlaces.length) {
    throw new Error('请至少保留一个北京目的地。');
  }
  const requestedStart = options.startPlaceId ? placeMap[options.startPlaceId] : null;
  const origin = exactPlaces[0] ??
    (requestedStart && pool.some((item) => item.id === requestedStart.id) ? requestedStart : null) ??
    pool
      .slice()
      .sort((a, b) => baseScore(b, wanted, included) - baseScore(a, wanted, included))[0];

  const used = new Set<string>([origin.id]);
  const stops: BeijingRouteStop[] = [];
  let current = origin;
  const compactExplicit = included.size >= 2;
  let elapsed = dwellMinutes(origin, options, compactExplicit && included.has(origin.id));
  let totalDistanceKm = 0;

  const appendStop = (item: BeijingPlace, transfer: ReturnType<typeof transferEstimate>, dwell: number) => {
    const arrive = elapsed + transfer.minutes;
    const leave = arrive + dwell;
    stops.push({
      place: item,
      arrive,
      leave,
      travelMinutes: transfer.minutes,
      distanceKm: Math.round(transfer.distance * 10) / 10,
      travelMode: transfer.mode,
      routeProvider: 'estimate',
      reason: reasonFor(item, wanted),
    });
    used.add(item.id);
    current = item;
    elapsed = leave;
    totalDistanceKm += transfer.distance;
  };

  if (options.preserveSelectedStops) {
    for (const item of exactPlaces.slice(1)) {
      appendStop(
        item,
        transferEstimate(current, item, options.travelMode, options.pace.speed),
        dwellMinutes(item, options, compactExplicit && included.has(item.id)),
      );
    }
  } else {
    while (stops.length < MAX_STOPS && elapsed < options.minutes) {
      const candidates = pool
        .filter((item) => !used.has(item.id))
        .map((item) => {
          const transfer = transferEstimate(current, item, options.travelMode, options.pace.speed);
          const dwell = dwellMinutes(item, options, compactExplicit && included.has(item.id));
          const score = baseScore(item, wanted, included) - transfer.minutes * 0.16 - transfer.distance * 0.22;
          return { item, transfer, dwell, score };
        })
        .filter(({ item, transfer, dwell }) =>
          (included.has(item.id) || item.interests.some((id) => wanted.includes(id)) || item.mustSee) &&
          elapsed + transfer.minutes + dwell <= options.minutes,
        )
        .sort((a, b) => b.score - a.score);

      if (!candidates.length) break;
      const pick = candidates[0];
      appendStop(pick.item, pick.transfer, pick.dwell);
    }
  }

  const optionalStops: BeijingRouteStop[] = pool
    .filter((item) => !used.has(item.id))
    .map((item) => {
      const transfer = transferEstimate(current, item, options.travelMode, options.pace.speed);
      const dwell = dwellMinutes(item, options, compactExplicit && included.has(item.id));
      return {
        item,
        transfer,
        dwell,
        score: baseScore(item, wanted, included) - transfer.minutes * 0.18 - transfer.distance * 0.25,
      };
    })
    .filter(({ item }) => included.has(item.id) || item.interests.some((id) => wanted.includes(id)) || item.mustSee)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_OPTIONAL_STOPS)
    .map(({ item, transfer, dwell }) => ({
      place: item,
      arrive: elapsed + transfer.minutes,
      leave: elapsed + transfer.minutes + dwell,
      travelMinutes: transfer.minutes,
      distanceKm: Math.round(transfer.distance * 10) / 10,
      travelMode: transfer.mode,
      routeProvider: 'estimate',
      reason: `可选延伸 · ${reasonFor(item, wanted)}`,
    }));

  const allPrimary = [origin, ...stops.map((stop) => stop.place)];
  const remainingMinutes = Math.max(0, Math.round(options.minutes - elapsed));
  const overrun = Math.max(0, Math.round(elapsed - options.minutes));
  const matchedInterests = wanted.filter((id) => allPrimary.some((item) => item.interests.includes(id)));
  const title = routeTitle(allPrimary, options);

  return {
    kind: 'beijing',
    title,
    subtitle: `${options.pace.label}节奏 · ${allPrimary.length} 个目的地 · 市内交通约 ${Math.round(totalDistanceKm * 10) / 10} 公里`,
    origin,
    stops,
    optionalStops,
    remainingMinutes,
    remainingAdvice: overrun
      ? `当前路线超出预算约 ${overrun} 分钟。已保留全部选定站点，可增加游览时间或手动删除站点。`
      : remainingAdvice(remainingMinutes, optionalStops, elapsed),
    totalMinutes: elapsed,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    routeProvider: 'estimate',
    routeNotice: '当前使用本地距离模型估算交通时间。',
    matchedInterests,
    pace: options.pace,
  };
}

export function beijingRouteToText(plan: BeijingRoutePlan, spending?: import('../types').TripSpending): string {
  const opening = (place: BeijingPlace) => {
    const hours = (place as BeijingPlace & { openingHours?: unknown }).openingHours;
    return typeof hours === 'string' && hours.trim() ? hours : '尚未核实，请查看官方公告。';
  };
  const originDwell = plan.stops[0]
    ? plan.stops[0].arrive - plan.stops[0].travelMinutes
    : plan.totalMinutes;
  const lines = [
    `北京智能旅行 · ${plan.title}`,
    plan.subtitle,
    ROUTE_AVAILABILITY_NOTICE,
    `1. ${plan.origin.name}（建议停留 ${Math.round(originDwell)} 分钟）`,
    `开放说明：${opening(plan.origin)}`,
    ...plan.stops.map(
      (stop, index) =>
        `${index + 2}. ${stop.place.name}（${stop.travelMode}约 ${stop.travelMinutes} 分钟，停留 ${Math.round(stop.leave - stop.arrive)} 分钟）\n开放说明：${opening(stop.place)}`,
    ),
    `总计：${formatDuration(plan.totalMinutes)}，点位间约 ${plan.totalDistanceKm} 公里（${plan.routeProvider === 'amap' ? '高德实时路线' : plan.routeProvider === 'hybrid' ? '高德与本地混合路线' : '本地估算'}）`,
    `剩余时间：${plan.remainingMinutes} 分钟。${plan.remainingAdvice}`,
  ];
  return [...lines, budgetToText(plan, spending)].join('\n');
}

