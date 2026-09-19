import { GATE_IDS, PACES } from '../data/interests';
import { SPOTS, SPOT_MAP } from '../data/spots';
import { TRIPS } from '../data/trips';
import type { InterestId, PaceId, PlanOptions } from '../types';
import { buildRoute, formatClock } from './planner';
import { INTEREST_IDS } from './toolSchemas';
import type { AgentToolContext } from '../agent/types';

/**
 * 工具执行层：只负责读取本地数据并返回结构化结果。
 * 它不负责提示词、场景判断或网络请求，方便以后把 data 层迁移到 API/数据库。
 */

function asStringArray(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && allowed.includes(item),
  );
}

function resolveSpotId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (SPOT_MAP[value]) return value;
  const lowered = value.toLowerCase();
  const byId = SPOTS.find((spot) => spot.id.toLowerCase() === lowered);
  if (byId) return byId.id;
  const byName = SPOTS.find(
    (spot) => spot.name === value || spot.name.includes(value) || value.includes(spot.name),
  );
  return byName ? byName.id : null;
}

export function runTool(
  name: string,
  rawArguments: string,
  context: AgentToolContext,
): string {
  let args: Record<string, unknown> = {};
  try {
    args = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: '参数不是合法 JSON，请重新调用。' });
  }

  if (name === 'list_spots') {
    const interests = asStringArray(args.interests, INTEREST_IDS);
    const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
    const matched = SPOTS.filter((spot) => {
      if (spot.kind === '入口') return false;
      const hitInterest = interests.length === 0 || spot.interests.some((id) => interests.includes(id));
      const hitKeyword =
        !keyword ||
        spot.name.includes(keyword) ||
        spot.short.includes(keyword) ||
        spot.highlights.some((highlight) => highlight.includes(keyword));
      return hitInterest && hitKeyword;
    });
    context.trace.push(`list_spots(${matched.length} 个点位)`);
    return JSON.stringify({
      count: matched.length,
      spots: matched.slice(0, 12).map((spot) => ({
        id: spot.id,
        name: spot.name,
        kind: spot.kind,
        short: spot.short,
        bestTime: spot.bestTime,
        interests: spot.interests,
      })),
    });
  }

  if (name === 'build_route') {
    const interests = asStringArray(args.interests, INTEREST_IDS) as InterestId[];
    const rawMinutes = typeof args.minutes === 'number' ? args.minutes : Number(args.minutes);
    const minutes = Number.isFinite(rawMinutes) ? Math.min(480, Math.max(15, Math.round(rawMinutes))) : 60;
    const paceId = (typeof args.pace === 'string' && PACES.some((p) => p.id === args.pace)
      ? args.pace
      : 'normal') as PaceId;
    const pace = PACES.find((item) => item.id === paceId) ?? PACES[1];
    const startId =
      typeof args.start_gate === 'string' && GATE_IDS.includes(args.start_gate)
        ? args.start_gate
        : 'east-gate';
    const validSpotIds = SPOTS.filter((spot) => spot.kind !== '入口').map((spot) => spot.id);
    const includeSpotIds = asStringArray(args.include_spot_ids, validSpotIds);
    const excludeSpotIds = asStringArray(args.exclude_spot_ids, validSpotIds);

    const options: PlanOptions = { interests, minutes, pace, startId, includeSpotIds, excludeSpotIds };
    const plan = buildRoute(SPOTS, options);
    context.plan = plan;
    context.planOptions = options;
    context.trace.push(`build_route(${plan.stops.length} 站 / ${Math.round(plan.totalMinutes)} 分钟)`);

    return JSON.stringify({
      title: plan.title,
      subtitle: plan.subtitle,
      origin: plan.origin.name,
      totalMinutes: Math.round(plan.totalMinutes),
      totalMeters: plan.totalMeters,
      stops: plan.stops.map((stop, index) => ({
        order: index + 1,
        name: stop.spot.name,
        spotId: stop.spot.id,
        arrive: formatClock(stop.arrive),
        leave: formatClock(stop.leave),
        walkMinutes: stop.walkMinutes,
        reason: stop.reason,
      })),
      note: '时间与距离为示意估算，出行前请确认开放情况。',
    });
  }

  if (name === 'get_spot_detail') {
    const id = resolveSpotId(args.spot_id);
    if (!id) {
      context.trace.push('get_spot_detail(未找到)');
      return JSON.stringify({
        error: '没有找到这个点位，请先调用 list_spots 获取正确的 spot_id。',
        candidates: SPOTS.filter((spot) => spot.kind !== '入口')
          .slice(0, 8)
          .map((spot) => ({ id: spot.id, name: spot.name })),
      });
    }
    const spot = SPOT_MAP[id];
    if (!context.spotIds.includes(id)) context.spotIds.push(id);
    context.trace.push(`get_spot_detail(${spot.name})`);
    return JSON.stringify({
      id: spot.id,
      name: spot.name,
      kind: spot.kind,
      description: spot.description,
      highlights: spot.highlights,
      bestTime: spot.bestTime,
      visitMinutes: spot.visit,
      tips: spot.tips ?? '',
    });
  }

  if (name === 'suggest_trip') {
    const duration = args.duration === 'full' ? 'full' : 'half';
    const theme = typeof args.theme === 'string' ? args.theme.trim() : '';
    const budget = typeof args.budget_max === 'number' ? args.budget_max : Number(args.budget_max) || 0;
    const wantsFullDay = duration === 'full';
    const matched = TRIPS.filter((trip) => {
      const durationHit = wantsFullDay
        ? trip.duration.includes('一天')
        : trip.duration.includes('半天');
      const themeHit =
        !theme ||
        trip.theme.includes(theme) ||
        trip.summary.includes(theme) ||
        trip.name.includes(theme) ||
        trip.tips.some((tip) => tip.includes(theme));
      return durationHit && themeHit;
    });
    const shortlisted = (matched.length ? matched : TRIPS).slice(0, 3);
    shortlisted.forEach((trip) => {
      if (!context.tripIds.includes(trip.id)) context.tripIds.push(trip.id);
    });
    context.trace.push(`suggest_trip(${shortlisted.length} 条线路)`);

    return JSON.stringify({
      budgetMax: budget,
      trips: shortlisted.map((trip) => ({
        id: trip.id,
        name: trip.name,
        theme: trip.theme,
        duration: trip.duration,
        budget: trip.budget,
        transport: trip.transport,
        bestSeason: trip.bestSeason,
        summary: trip.summary,
        timeline: trip.timeline,
        tips: trip.tips,
      })),
    });
  }

  context.trace.push(`${name}(未知工具)`);
  return JSON.stringify({ error: `未知工具：${name}` });
}
