import { databasePlaces, cityPlanningPlaces, matchingCityPlaces, PlaceDatabaseError, type PlaceRepository } from './placeRepository';
import { campusById, campusSpotMap } from '../data/campuses';
import {
  districtIdsFromText,
} from '../data/beijingPlaces';
import type {
  BeijingRouteOptions,
  BeijingRoutePlan,
  InterestId,
  PlanOptions,
  RoutePlan,
  Spot,
} from '../types';
import { formatDuration } from './planner';
import { runTool } from './toolExecutor';
import type { AgentToolContext } from '../agent/types';
import { routeScene, sceneForTarget, type Scene } from './sceneRouter';
import { resolveDatabaseTravelTarget } from './databaseTravelTarget';
import {
  resolveTravelTarget,
  type TravelTarget,
} from './travelTarget';

/**
 * 内置助手：不调用大模型，用规则解析中文问题后查询同一套景点数据库和工具。
 * 它仍需要访问景点服务；数据库不可用时不能用模型记忆或旧文件伪造查询成功。
 */

export interface LocalAnswer {
  text: string;
  plan: RoutePlan | null;
  planOptions: PlanOptions | null;
  beijingPlan?: BeijingRoutePlan | null;
  beijingPlanOptions?: BeijingRouteOptions | null;
  spotIds: string[];
  placeIds?: string[];
  tripIds: string[];
  trace: string[];
  /** 记住这次的参数，方便接着追问「改成 2 小时」这类问题。 */
  memory: LocalMemory;
}

export interface LocalMemory {
  scene: Scene;
  target: TravelTarget;
  minutes: number;
  interests: InterestId[];
  gateId: string;
  selectedSpotId?: string;
  beijingIncludePlaceIds?: string[];
  beijingExcludePlaceIds?: string[];
}

const NEGATION = /(不要|不看|不去|不逛|去掉|去掉|别去|不想看|不想去|没有兴趣)/;
const RESET = /(重新|重来|清空|从零|换一个新)/;

const INTEREST_KEYWORDS: Record<InterestId, string[]> = {
  plant: ['植物', '园林', '树', '花', '银杏', '绿化', '苗木', '温室', '牡丹', '月季', '竹', '园子', '草坪'],
  culture: ['人文', '建筑', '校史', '历史', '老楼', '文化', '老馆'],
  research: ['科研', '学术', '研究', '标本', '博物馆', '实验室'],
  sport: ['运动', '体育', '跑步', '球场', '锻炼', '操场', '健身'],
  food: ['吃', '食堂', '美食', '餐厅', '饭', '好吃'],
  photo: ['拍照', '摄影', '出片', '打卡', '机位', 'photo'],
};

const GATE_KEYWORDS: [RegExp, string][] = [
  // 注意顺序：「小南门 / 东南门」必须先判断，否则会被「南门」抢先匹配。
  [/东南门/, 'gate-southeast'],
  [/小南门|西南门/, 'gate-southwest'],
  [/正门|主校门|南门/, 'gate-main'],
  [/北门/, 'gate-north'],
];

const SPOT_KEYWORDS: [RegExp, string][] = [
  [/银杏/, 'ginkgo-avenue'],
  [/校史/, 'history-hall'],
  [/图书馆/, 'library'],
  [/主楼/, 'main-hall'],
  [/学研/, 'xueyan'],
  [/林之心/, 'forest-heart'],
  [/雨水花园/, 'rain-garden'],
  [/闪电广场/, 'lightning-square'],
  [/苗圃|三顷园/, 'nursery'],
  [/水土保持|水保|林学院/, 'soil-college'],
  [/生物/, 'biology-college'],
  [/理学院/, 'science-college'],
  [/活动中心/, 'activity-center'],
  [/田家炳|体育馆/, 'gym'],
  [/操场|田径场|运动场|跑道/, 'stadium'],
  [/一食堂/, 'canteen-1'],
  [/二食堂/, 'canteen-2'],
  [/禾谷园/, 'hegu-yuan'],
  [/咖啡/, 'cafe'],
  [/一教|第一教学/, 'teaching-1'],
  [/三教|第三教学/, 'teaching-3'],
];

const OUTSIDE_KEYWORDS =
  /(北京|校外|周边|出去玩|一日游|半天玩|周末去哪|去哪玩|公园|故宫|天坛|颐和园|圆明园|香山|奥森|奥林匹克|长城|环球度假区|爬山|远一点|出学校)/;

const HELP_KEYWORDS = /(你好|您好|hi|hello|在吗|帮助|怎么用|能做什么|你是谁|介绍一下自己)/i;

const CN_NUMBERS: Record<string, number> = {
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function clampMinutes(value: number): number {
  return Math.min(480, Math.max(15, Math.round(value)));
}

export function parseMinutes(text: string): number | null {
  if (/半天/.test(text)) return 240;
  if (/(一整天|一天|全天)/.test(text)) return 480;
  if (/半个?小时|半小时/.test(text)) return 30;
  if (/课间|一节课/.test(text)) return 30;

  const minutes = text.match(/(\d+)\s*分钟/);
  if (minutes) return clampMinutes(Number(minutes[1]));

  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|h|H)/);
  if (hours) return clampMinutes(Number(hours[1]) * 60);

  const cnHours = text.match(/([一两二三四五六七八九十])\s*(?:个)?\s*小时/);
  if (cnHours && CN_NUMBERS[cnHours[1]]) return clampMinutes(CN_NUMBERS[cnHours[1]] * 60);

  return null;
}

export function parseInterests(text: string): InterestId[] {
  const hits: InterestId[] = [];
  (Object.keys(INTEREST_KEYWORDS) as InterestId[]).forEach((id) => {
    if (INTEREST_KEYWORDS[id].some((keyword) => text.includes(keyword))) hits.push(id);
  });
  return hits;
}

/** 只在文本里明确提到门岗时返回，否则返回 null，方便沿用上一轮的起点。 */
export function matchGate(text: string): string | null {
  for (const [pattern, id] of GATE_KEYWORDS) {
    if (pattern.test(text)) return id;
  }
  return null;
}

function parseSpot(text: string, spots: Spot[]): string | null {
  for (const [pattern, id] of SPOT_KEYWORDS) {
    if (pattern.test(text) && spots.some((spot) => spot.id === id)) return id;
  }
  const byName = spots.find((spot) => spot.kind !== '入口' && text.includes(spot.name));
  return byName ? byName.id : null;
}

function emptyContext(target: TravelTarget): AgentToolContext {
  return {
    target,
    plan: null,
    planOptions: null,
    beijingPlan: null,
    beijingPlanOptions: null,
    spotIds: [],
    placeIds: [],
    tripIds: [],
    trace: [],
  };
}

function safeParse<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

/** 合并本轮识别到的兴趣与上一轮的记忆；带否定词表示「去掉」。 */
function mergeInterests(
  text: string,
  parsed: InterestId[],
  previous: InterestId[],
): InterestId[] {
  if (!previous.length) return parsed;
  if (!parsed.length) return previous;

  // 按分句判断：带否定词的句子是要去掉的，其它句子是要加的。
  const removals = new Set<InterestId>();
  const additions = new Set<InterestId>();
  for (const clause of text.split(/[，。,.!！?？;；\s]+/).filter(Boolean)) {
    const hits = parseInterests(clause);
    if (!hits.length) continue;
    const target = NEGATION.test(clause) ? removals : additions;
    hits.forEach((id) => target.add(id));
  }

  if (!removals.size && !additions.size) {
    return NEGATION.test(text)
      ? previous.filter((id) => !parsed.includes(id))
      : Array.from(new Set([...previous, ...parsed]));
  }

  const next = previous.filter((id) => !removals.has(id));
  additions.forEach((id) => {
    if (!next.includes(id)) next.push(id);
  });
  return next;
}

/**
 * 对外入口：支持追问。例如先问「1 小时怎么逛」，再说「改成 2 小时」「换成南门」「不想看花了」。
 */
async function answerLocallyCore(rawText: string, previous: LocalMemory | null | undefined, repository: PlaceRepository): Promise<LocalAnswer> {
  const text = rawText.trim();
  const following = Boolean(previous) && !RESET.test(text);
  const base = following && previous ? previous : null;
  const target = await resolveDatabaseTravelTarget(text, base?.target, repository);
  const campus = target.kind === 'campus' ? campusById(target.campusId) : null;
  const spots = campus?.spots ?? [];
  const parsedSpot = parseSpot(text, spots);
  const routed = routeScene(text, base?.scene ?? 'unknown');
  const targetScene = sceneForTarget(routed, target);
  const scene: Scene = targetScene === 'unknown' && parsedSpot ? 'spot-detail' : targetScene;

  const explicitMinutes = parseMinutes(text);
  const parsedInterests = parseInterests(text);
  const cityPlaces = target.kind !== 'campus' && scene !== 'system-help' && scene !== 'unknown' && scene !== 'weather'
    ? await cityPlanningPlaces(repository, target.districtIds ?? [], [...(base?.beijingIncludePlaceIds ?? []), ...(base?.beijingExcludePlaceIds ?? [])]) : [];
  const namedBeijingPlaceIds = matchingCityPlaces(text, cityPlaces).map((place) => place.id);
  const removesBeijingPlace = /(不要|不去|去掉|删除|移除|排除)/.test(text);
  const previousBeijingIncludes = base?.beijingIncludePlaceIds ?? [];
  const previousBeijingExcludes = base?.beijingExcludePlaceIds ?? [];
  const beijingIncludePlaceIds = removesBeijingPlace
    ? previousBeijingIncludes.filter((id) => !namedBeijingPlaceIds.includes(id))
    : Array.from(new Set([...previousBeijingIncludes, ...namedBeijingPlaceIds]));
  const beijingExcludePlaceIds = removesBeijingPlace
    ? Array.from(new Set([...previousBeijingExcludes, ...namedBeijingPlaceIds]))
    : previousBeijingExcludes.filter((id) => !namedBeijingPlaceIds.includes(id));
  const memory: LocalMemory = {
    scene,
    target,
    minutes: explicitMinutes ?? base?.minutes ?? (/下午|半天/.test(text) ? 240 : 60),
    interests: base
      ? mergeInterests(text, parsedInterests, base.interests)
      : parsedInterests,
    gateId:
      (campus?.id === 'bfu' ? matchGate(text) : null) ??
      (base?.target.campusId === target.campusId ? base?.gateId : undefined) ??
      campus?.defaultGateId ??
      '',
    selectedSpotId: parsedSpot ?? base?.selectedSpotId,
    beijingIncludePlaceIds,
    beijingExcludePlaceIds,
  };

  const answer = await answerCore(rawText, memory, repository, cityPlaces);
  return {
    ...answer,
    memory: { ...memory, selectedSpotId: answer.spotIds[0] ?? memory.selectedSpotId },
  };
}

export async function answerLocally(rawText: string, previous?: LocalMemory | null, repository: PlaceRepository = databasePlaces): Promise<LocalAnswer> {
  try { return await answerLocallyCore(rawText, previous, repository); }
  catch (error) {
    if (!(error instanceof PlaceDatabaseError)) throw error;
    const target = resolveTravelTarget(rawText, previous?.target);
    return { text: error.message, plan: null, planOptions: null, spotIds: [], tripIds: [],
      trace: ['景点数据库不可用，未生成路线'], memory: previous ?? {
        scene: sceneForTarget(routeScene(rawText, 'unknown'), target), target,
        minutes: parseMinutes(rawText) ?? 240, interests: parseInterests(rawText), gateId: '',
      } };
  }
}

async function answerCore(rawText: string, memory: LocalMemory, repository: PlaceRepository, cityPlaces: Awaited<ReturnType<typeof cityPlanningPlaces>>): Promise<Omit<LocalAnswer, 'memory'>> {
  const text = rawText.trim();
  const context = emptyContext(memory.target);
  context.placeRepository = repository;
  const campus = memory.target.kind === 'campus' ? campusById(memory.target.campusId) : null;
  const spots = campus?.spots ?? [];
  const spotMap = campus ? campusSpotMap(campus) : {};
  const explicitMinutes = parseMinutes(text);
  const minutes = explicitMinutes ?? memory.minutes;
  const interests = memory.interests;
  const gateId = (campus?.id === 'bfu' ? matchGate(text) : null) ?? memory.gateId;
  const gateName = spotMap[gateId]?.name ?? campus?.shortName ?? '北京市';
  const spotId = parseSpot(text, spots) ?? memory.selectedSpotId ?? null;

  if (memory.scene === 'system-help') {
    return {
      text: [
        '我是北京智能旅行助手，可以：',
        '· 排已收录校园路线：「我有 3 小时，想逛北京交通大学」',
        '· 讲点位：「银杏大道值得专门去吗」',
        '· 规划北京路线：「一天游故宫、天坛和什刹海」',
        '',
        '当前使用内置助手，不需要密钥，也不消耗额度。',
      ].join('\n'),
      plan: null,
      planOptions: null,
      spotIds: [],
      tripIds: [],
      trace: [],
    };
  }

  if (memory.scene === 'unknown') {
    return {
      text: '你想逛北京市区、某个行政区，还是进入某所高校？可以说「一天游故宫和天坛」或「3 小时逛北京交通大学」。',
      plan: null,
      planOptions: null,
      spotIds: [],
      tripIds: [],
      trace: [],
    };
  }

  // 1) 北京城市路线
  if (memory.scene === 'outside-trip' || OUTSIDE_KEYWORDS.test(text)) {
    const namedPlaces = (memory.beijingIncludePlaceIds ?? [])
      .map((id) => cityPlaces.find((place) => place.id === id))
      .filter((place): place is (typeof cityPlaces)[number] => Boolean(place));
    const districts = districtIdsFromText(text).length
      ? districtIdsFromText(text)
      : memory.target.districtIds ?? [];
    const seasonalPlaces = text.includes('银杏')
      ? cityPlaces.filter((place) =>
          (!districts.length || districts.includes(place.districtId)) &&
          place.highlights.some((highlight) => highlight.includes('银杏')),
        )
      : [];
    const requestedPlaces = Array.from(new Set([...namedPlaces, ...seasonalPlaces]));
    const result = safeParse<{
      title: string;
      totalMinutes: number;
      totalDistanceKm: number;
      mustSeeStops: Array<{ order: number; name: string; district: string; travelMode: string; travelMinutes: number }>;
      optionalStops: Array<{ name: string; district: string }>;
      remainingMinutes: number;
      remainingAdvice: string;
    }>(
      await runTool(
        'build_beijing_route',
        JSON.stringify({
          minutes: Math.max(60, minutes),
          interests,
          district_ids: districts,
          pace: 'normal',
          travel_mode: 'mixed',
          start_place_id: requestedPlaces[0]?.id ?? '',
          start_hour: /下午|傍晚/.test(text) ? 14 : 9,
          include_place_ids: requestedPlaces.map((place) => place.id),
          exclude_place_ids: memory.beijingExcludePlaceIds ?? [],
        }),
        context,
      ),
    );
    const routeLine = (result.mustSeeStops ?? [])
      .map((stop) => `${stop.order}. ${stop.name}（${stop.district}）`)
      .join(' → ');
    const optionalLine = result.optionalStops?.length
      ? `\n\n可选站点：${result.optionalStops.map((stop) => `${stop.name}（${stop.district}）`).join('、')}`
      : '';
    const foodStops = [context.beijingPlan?.origin, ...(context.beijingPlan?.stops.map((stop) => stop.place) ?? [])]
      .filter((place) => place?.category === 'neighborhood' && place.interests.includes('food'));
    const diningLine = interests.includes('food')
      ? `\n\n用餐建议：${foodStops.length ? `在${foodStops[0]?.name}预留一餐，` : '沿线预留一餐，'}可按喜好找京味餐饮；目前未收录已核实的具体餐馆，营业与排队情况请出发前确认。`
      : '';
    return {
      text: routeLine
        ? `给你生成了「${result.title}」：\n\n${routeLine}${optionalLine}${diningLine}\n\n预计 ${Math.round(result.totalMinutes)} 分钟，点位间约 ${result.totalDistanceKm} 公里。剩余约 ${result.remainingMinutes} 分钟：${result.remainingAdvice}${seasonalPlaces.length ? '\n\n银杏叶色和当日开放情况请出发前向园方确认。' : ''}`
        : '暂时没有生成合适的北京路线，请补充时长、行政区或想去的景点。',
      plan: null,
      planOptions: null,
      beijingPlan: context.beijingPlan,
      beijingPlanOptions: context.beijingPlanOptions,
      spotIds: [],
      placeIds: context.placeIds,
      tripIds: [],
      trace: context.trace,
    };
  }

  // 2) 点位讲解
  const wantsDetail = /(值得|怎么样|好不好|是什么|介绍|讲讲|说说|开放|几点|好玩|看看)/.test(text);
  if (memory.scene === 'spot-detail' && spotId && (wantsDetail || !explicitMinutes)) {
    const detail = safeParse<{ name: string; description: string; highlights: string[]; bestTime: string; visitMinutes: number; tips: string }>(
      await runTool('get_spot_detail', JSON.stringify({ campus_id: campus?.id, spot_id: spotId }), context),
    );
    const tip = detail.tips ? `\n\n小贴士：${detail.tips}` : '';
    return {
      text: `${detail.name}：${detail.description}\n\n建议停留 ${detail.visitMinutes} 分钟，最佳时段是${detail.bestTime}。${tip}`,
      plan: null,
      planOptions: null,
      spotIds: context.spotIds,
      tripIds: [],
      trace: context.trace,
    };
  }

  if (memory.target.kind !== 'campus' || !campus) {
    return {
      text: '请先说明要进入哪所高校；如果想逛北京市，可以说「一天游故宫、天坛和什刹海」。',
      plan: null,
      planOptions: null,
      spotIds: [],
      tripIds: [],
      trace: ['校园路线缺少明确目标'],
    };
  }

  if (!campus.spots?.length) {
    return {
      text: `目前已在海淀地图中收录${campus.name}的位置，但还没有该校的校内点位数据，因此暂时不能生成内部路线，也不会用其他学校的路线替代。`,
      plan: null,
      planOptions: null,
      spotIds: [],
      tripIds: [],
      trace: [`${campus.shortName}校内数据待补充`],
    };
  }

  // 3) 校园路线（默认意图）
  const planMinutes = minutes;
  const result = safeParse<{
    title: string;
    totalMinutes: number;
    totalMeters: number;
    mustSeeStops?: { order: number; name: string; arrive: string; leave: string; walkMeters: number; reason: string }[];
    stops?: { order: number; name: string; arrive: string; leave: string; walkMeters: number; reason: string }[];
    optionalStops?: { order: number; name: string; arrive: string; leave: string; walkMeters: number; reason: string }[];
    remainingMinutes?: number;
    remainingAdvice?: string;
  }>(
    await runTool(
      'build_route',
      JSON.stringify({
        campus_id: campus.id,
        interests,
        minutes: planMinutes,
        pace: 'normal',
        start_gate: gateId,
      }),
      context,
    ),
  );

  if (HELP_KEYWORDS.test(text) && !explicitMinutes && !spotId && interests.length === 0) {
    return {
      text: [
        '我是北京智能旅行助手，可以：',
        '· 排已收录校园路线：「我有 3 小时，想逛北京交通大学」',
        '· 讲点位：「银杏大道值得专门去吗」',
        '· 规划北京路线：「一天游故宫、天坛和什刹海」',
        '',
        '提示：现在用的是内置助手（不需要密钥、不消耗额度）。',
      ].join('\n'),
      plan: null,
      planOptions: null,
      spotIds: [],
      tripIds: [],
      trace: [],
    };
  }

  const stops = result.mustSeeStops ?? result.stops ?? [];
  if (!stops.length) {
    return {
      text: `暂时没排出${campus.shortName}路线，请补充时长或兴趣，例如「3 小时逛${campus.shortName}，想看历史建筑和拍照」。`,
      plan: null,
      planOptions: null,
      spotIds: [],
      tripIds: [],
      trace: context.trace,
    };
  }

  const routeLine = stops.map((stop) => `${stop.order}. ${stop.name}（${stop.arrive}）`).join(' → ');
  const optionalLine = result.optionalStops?.length
    ? `\n\n可选站点：${result.optionalStops.map((stop) => `${stop.name}（${stop.arrive}）`).join('、')}`
    : '';
  const remainingLine = result.remainingAdvice
    ? `\n剩余时间建议（约 ${result.remainingMinutes ?? 0} 分钟）：${result.remainingAdvice}`
    : '';
  const interestNote = interests.length ? '按你提到的兴趣' : '按默认的园林 + 人文 + 摄影';
  return {
    text: `${interestNote}，从${gateName}进入${campus.shortName}、${formatDuration(planMinutes)}的预算，给你排了「${result.title}」：\n\n${routeLine}${optionalLine}\n\n必游主线约 ${Math.round(result.totalMinutes)} 分钟、步行 ${result.totalMeters} 米。${remainingLine}\n\n想换时长或兴趣，直接说「2 小时」或者「多一点拍照」就行。`,
    plan: context.plan,
    planOptions: context.planOptions,
    spotIds: [],
    tripIds: [],
    trace: context.trace,
  };
}
