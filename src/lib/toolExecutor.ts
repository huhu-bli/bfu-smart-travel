import { PACES } from '../data/interests';
import { campusById, type CampusDefinition } from '../data/campuses';
import type { Spot } from '../types';
import { TRIPS } from '../data/trips';
import type { InterestId, PaceId, PlanOptions } from '../types';
import { buildRoute, formatClock } from './planner';
import { fetchWeather } from './weather';
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

function resolveSpotId(raw: unknown, spots: Spot[]): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (spots.some((spot) => spot.id === value)) return value;
  const lowered = value.toLowerCase();
  const byId = spots.find((spot) => spot.id.toLowerCase() === lowered);
  if (byId) return byId.id;
  const byName = spots.find(
    (spot) => spot.name === value || spot.name.includes(value) || value.includes(spot.name),
  );
  return byName ? byName.id : null;
}

/**
 * 从展示用预算文本中提取保守的最高预算。
 * 例如“50-120 元”按 120 元计算，避免推荐出可能超出用户上限的线路。
 */
function tripBudgetUpperBound(budget: string): number | null {
  if (/免费/.test(budget)) return 0;
  const values = (budget.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function campusForTool(
  args: Record<string, unknown>,
  context: AgentToolContext,
): { campus: CampusDefinition | null; error?: string } {
  if (context.target.kind !== 'campus') {
    return { campus: null, error: '当前目标是海淀区综合旅行，请先明确要进入哪所学校，再调用校园工具。' };
  }
  const targetCampus = campusById(context.target.campusId);
  if (!targetCampus) {
    return { campus: null, error: `没有找到目标校园「${context.target.label}」的配置。` };
  }
  if (!targetCampus.spots?.length) {
    return {
      campus: targetCampus,
      error: `暂未收录${targetCampus.name}的校内详细点位，不能生成内部路线，更不能用其他学校路线替代。`,
    };
  }
  const requested = typeof args.campus_id === 'string' ? args.campus_id : '';
  if (requested && requested !== targetCampus.id) {
    context.trace.push(`campus_guard(${requested} → ${targetCampus.id})`);
  }
  return { campus: targetCampus };
}

export async function runTool(
  name: string,
  rawArguments: string,
  context: AgentToolContext,
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: '参数不是合法 JSON，请重新调用。' });
  }

  if (name === 'list_spots') {
    const resolved = campusForTool(args, context);
    if (!resolved.campus || resolved.error) {
      context.trace.push('list_spots(目标不支持)');
      return JSON.stringify({ error: resolved.error });
    }
    const campus = resolved.campus;
    const spots = campus.spots ?? [];
    const interests = asStringArray(args.interests, INTEREST_IDS);
    const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
    const matched = spots.filter((spot) => {
      if (spot.kind === '入口') return false;
      const hitInterest = interests.length === 0 || spot.interests.some((id) => interests.includes(id));
      const hitKeyword =
        !keyword ||
        spot.name.includes(keyword) ||
        spot.short.includes(keyword) ||
        spot.highlights.some((highlight) => highlight.includes(keyword));
      return hitInterest && hitKeyword;
    });
    context.trace.push(`list_spots(${campus.shortName} / ${matched.length} 个点位)`);
    return JSON.stringify({
      campusId: campus.id,
      campusName: campus.name,
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
    const resolved = campusForTool(args, context);
    if (!resolved.campus || resolved.error) {
      context.trace.push('build_route(目标不支持)');
      return JSON.stringify({ error: resolved.error });
    }
    const campus = resolved.campus;
    const spots = campus.spots ?? [];
    const interests = asStringArray(args.interests, INTEREST_IDS) as InterestId[];
    const rawMinutes = typeof args.minutes === 'number' ? args.minutes : Number(args.minutes);
    const minutes = Number.isFinite(rawMinutes) ? Math.min(480, Math.max(15, Math.round(rawMinutes))) : 60;
    const paceId = (typeof args.pace === 'string' && PACES.some((p) => p.id === args.pace)
      ? args.pace
      : 'normal') as PaceId;
    const pace = PACES.find((item) => item.id === paceId) ?? PACES[1];
    const gateIds = spots.filter((spot) => spot.kind === '入口').map((spot) => spot.id);
    const requestedGate = typeof args.start_gate === 'string' ? args.start_gate : '';
    const startId = gateIds.includes(requestedGate) ? requestedGate : campus.defaultGateId;
    const validSpotIds = spots.filter((spot) => spot.kind !== '入口').map((spot) => spot.id);
    const includeSpotIds = asStringArray(args.include_spot_ids, validSpotIds);
    const excludeSpotIds = asStringArray(args.exclude_spot_ids, validSpotIds);

    const options: PlanOptions = {
      campusId: campus.id,
      campusLabel: campus.shortName,
      interests,
      minutes,
      pace,
      startId,
      includeSpotIds,
      excludeSpotIds,
    };
    const plan = buildRoute(spots, options);
    context.plan = plan;
    context.planOptions = options;
    context.trace.push(`build_route(${campus.shortName} / ${plan.stops.length} 必游 / ${plan.optionalStops.length} 可选 / ${Math.round(plan.totalMinutes)} 分钟)`);

    return JSON.stringify({
      title: plan.title,
      campusId: campus.id,
      campusName: campus.name,
      subtitle: plan.subtitle,
      origin: plan.origin.name,
      totalMinutes: Math.round(plan.totalMinutes),
      totalMeters: plan.totalMeters,
      mustSeeStops: plan.stops.map((stop, index) => ({
        order: index + 1,
        name: stop.spot.name,
        spotId: stop.spot.id,
        arrive: formatClock(stop.arrive),
        leave: formatClock(stop.leave),
        walkMinutes: stop.walkMinutes,
        walkMeters: stop.walkMeters,
        reason: stop.reason,
      })),
      optionalStops: plan.optionalStops.map((stop, index) => ({
        order: index + 1,
        name: stop.spot.name,
        spotId: stop.spot.id,
        arrive: formatClock(stop.arrive),
        leave: formatClock(stop.leave),
        walkMinutes: stop.walkMinutes,
        walkMeters: stop.walkMeters,
        reason: stop.reason,
      })),
      remainingMinutes: plan.remainingMinutes,
      remainingAdvice: plan.remainingAdvice,
      note: '时间与距离为示意估算，出行前请确认开放情况。',
    });
  }

  if (name === 'get_spot_detail') {
    const resolved = campusForTool(args, context);
    if (!resolved.campus || resolved.error) {
      context.trace.push('get_spot_detail(目标不支持)');
      return JSON.stringify({ error: resolved.error });
    }
    const campus = resolved.campus;
    const spots = campus.spots ?? [];
    const id = resolveSpotId(args.spot_id, spots);
    if (!id) {
      context.trace.push('get_spot_detail(未找到)');
      return JSON.stringify({
        error: '没有找到这个点位，请先调用 list_spots 获取正确的 spot_id。',
        candidates: spots.filter((spot) => spot.kind !== '入口')
          .slice(0, 8)
          .map((spot) => ({ id: spot.id, name: spot.name })),
      });
    }
    const spot = spots.find((item) => item.id === id)!;
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
    // 奥林匹克森林公园位于朝阳区，保留旧数据但不在海淀产品中参与推荐。
    const haidianTrips = TRIPS.filter((trip) => trip.id !== 'aosen');
    const budgetFiltered = budget > 0
      ? haidianTrips.filter((trip) => {
          const upperBound = tripBudgetUpperBound(trip.budget);
          return upperBound !== null && upperBound <= budget;
        })
      : haidianTrips;
    const matched = budgetFiltered.filter((trip) => {
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
    const durationFallback = budgetFiltered.filter((trip) =>
      wantsFullDay ? trip.duration.includes('一天') : trip.duration.includes('半天'),
    );
    const shortlisted = (matched.length ? matched : durationFallback).slice(0, 3);
    shortlisted.forEach((trip) => {
      if (!context.tripIds.includes(trip.id)) context.tripIds.push(trip.id);
    });
    context.trace.push(`suggest_trip(${shortlisted.length} 条线路)`);

    return JSON.stringify({
      budgetMax: budget,
      budgetMatched: budget === 0 || shortlisted.length > 0,
      message:
        budget > 0 && !shortlisted.length
          ? `没有找到预算不超过 ${budget} 元且符合时长的线路。`
          : undefined,
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

  if (name === 'get_weather') {
    const providedLocation = typeof args.location === 'string' ? args.location.trim() : '';
    const genericLocation = /^(校园|校内|学校)$/.test(providedLocation);
    const location = !providedLocation || genericLocation ? context.target.label || '海淀区' : providedLocation;
    const date = typeof args.date === 'string' ? args.date.trim() : 'today';
    try {
      const weather = await fetchWeather(location, date);
      context.trace.push(`get_weather(${String(weather.location)} ${String(weather.date)})`);
      return JSON.stringify(weather);
    } catch (error) {
      const message = error instanceof Error ? error.message : '天气服务暂时不可用。';
      context.trace.push('get_weather(失败)');
      return JSON.stringify({ error: message });
    }
  }

  context.trace.push(`${name}(未知工具)`);
  return JSON.stringify({ error: `未知工具：${name}` });
}
