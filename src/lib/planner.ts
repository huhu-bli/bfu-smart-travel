import { GATE_IDS, INTEREST_MAP } from '../data/interests';
import type { InterestId, PlanOptions, RoutePlan, RouteStop, Spot } from '../types';

/** 示意图坐标到米的大致换算比例（示意值）。 */
const METERS_PER_UNIT = 1.1;
/** 标准步速，单位：米/分钟。 */
const BASE_SPEED = 78;
/** 单条路线最多安排的点位数量。 */
const MAX_STOPS = 8;

export function walkMeters(a: Spot, b: Spot): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * METERS_PER_UNIT);
}

export function walkMinutes(meters: number, speedFactor: number): number {
  const minutes = meters / (BASE_SPEED * speedFactor);
  return Math.max(1, Math.round(minutes * 10) / 10);
}

export function dwellMinutes(spot: Spot, dwellFactor: number): number {
  return Math.max(5, Math.round((spot.visit * dwellFactor) / 5) * 5);
}

export function formatDuration(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

export function formatClock(offsetMinutes: number, startHour = 9, startMinute = 0): string {
  const total = startHour * 60 + startMinute + Math.round(offsetMinutes);
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const THEMES: { ids: InterestId[]; title: string }[] = [
  { ids: ['photo', 'plant'], title: '银杏金秋 · 园林摄影线' },
  { ids: ['culture', 'research'], title: '学脉北林 · 人文科研线' },
  { ids: ['plant', 'research'], title: '绿野课堂 · 植物科研线' },
  { ids: ['culture', 'photo'], title: '老建筑巡礼 · 人文出片线' },
  { ids: ['sport', 'food'], title: '动静之间 · 运动美食线' },
];

function buildTitle(matched: InterestId[], minutes: number): string {
  for (const theme of THEMES) {
    if (theme.ids.every((id) => matched.includes(id))) return theme.title;
  }
  if (matched.length === 0) return '北林漫步 · 综合精华线';
  const labels = matched.slice(0, 2).map((id) => INTEREST_MAP[id]?.label ?? '校园');
  const prefix = minutes <= 30 ? '课间快闪' : minutes >= 240 ? '深度漫游' : '主题漫步';
  return `${prefix} · ${labels.join('＋')}线`;
}

function buildReason(spot: Spot, interests: InterestId[]): string {
  const hits = spot.interests.filter((id) => interests.includes(id));
  const parts: string[] = [];
  if (hits.length) {
    parts.push(`匹配「${hits.map((id) => INTEREST_MAP[id]?.label ?? id).join('、')}」`);
  }
  if (spot.mustSee) parts.push('北林必看');
  parts.push(spot.short);
  return parts.join(' · ');
}

function nearestCurrent(current: Spot, candidates: Spot[]): Spot | null {
  let best: Spot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const spot of candidates) {
    const distance = walkMeters(current, spot);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = spot;
    }
  }
  return best;
}

export function buildRoute(spots: Spot[], options: PlanOptions): RoutePlan {
  const { interests, minutes, pace, startId } = options;
  const wanted: InterestId[] = interests.length
    ? interests
    : (['plant', 'culture', 'photo'] as InterestId[]);

  const start = spots.find((spot) => spot.id === startId) ?? spots[0];
  const pool = spots.filter((spot) => !GATE_IDS.includes(spot.id));
  const used = new Set<string>();
  const stops: RouteStop[] = [];
  let current = start;
  let elapsed = 0;

  while (stops.length < MAX_STOPS) {
    const remaining = minutes - elapsed;
    if (remaining <= 5) break;

    const scored = pool
      .filter((spot) => !used.has(spot.id))
      .map((spot) => {
        const meters = walkMeters(current, spot);
        const walk = walkMinutes(meters, pace.speed);
        const dwell = dwellMinutes(spot, pace.dwell);
        const relevance = spot.interests.filter((id) => wanted.includes(id)).length;
        const score =
          relevance * 3 + (spot.mustSee ? 1.4 : 0) - walk * 0.22 - spot.visit * 0.012;
        return { spot, meters, walk, dwell, relevance, score };
      })
      .filter((item) => item.relevance > 0 || item.spot.mustSee);

    const candidates = scored.filter((item) => item.walk + item.dwell <= remaining);
    if (!candidates.length) break;

    candidates.sort((a, b) => b.score - a.score);
    const pick = candidates[0];

    const arrive = elapsed + pick.walk;
    const leave = arrive + pick.dwell;
    stops.push({
      spot: pick.spot,
      arrive,
      leave,
      walkMinutes: pick.walk,
      walkMeters: pick.meters,
      reason: buildReason(pick.spot, wanted),
    });
    used.add(pick.spot.id);
    current = pick.spot;
    elapsed = leave;
  }

  // 时间极紧时的兜底：至少给出一个离起点最近的点位。
  if (!stops.length) {
    const fallback = nearestCurrent(start, pool);
    if (fallback) {
      const meters = walkMeters(start, fallback);
      const walk = walkMinutes(meters, pace.speed);
      const dwell = dwellMinutes(fallback, pace.dwell);
      stops.push({
        spot: fallback,
        arrive: walk,
        leave: walk + dwell,
        walkMinutes: walk,
        walkMeters: meters,
        reason: `离${start.name}最近的看点 · ${fallback.short}`,
      });
      elapsed = walk + dwell;
    }
  }

  const totalMeters = stops.reduce((sum, stop) => sum + stop.walkMeters, 0);
  const matchedInterests = wanted.filter((id) =>
    stops.some((stop) => stop.spot.interests.includes(id)),
  );

  return {
    title: buildTitle(matchedInterests, minutes),
    subtitle: `${pace.label}步速 · 含停留约 ${formatDuration(elapsed)} · 步行约 ${totalMeters} 米`,
    origin: start,
    stops,
    totalMinutes: elapsed,
    totalMeters,
    matchedInterests,
    pace,
  };
}

export function routeToText(plan: RoutePlan, startName: string): string {
  const lines = [
    `北林智能旅行 · ${plan.title}`,
    plan.subtitle,
    `起点：${startName}`,
    '',
  ];
  plan.stops.forEach((stop, index) => {
    lines.push(
      `${index + 1}. ${stop.spot.name}（${formatClock(stop.arrive)}-${formatClock(stop.leave)}）`,
    );
    lines.push(`   ${stop.walkMinutes} 分钟 / ${stop.walkMeters} 米 · ${stop.reason}`);
  });
  lines.push('', '地图与时间为示意估算，出行前请以学校最新公告为准。');
  return lines.join('\n');
}
