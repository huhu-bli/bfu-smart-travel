import { BEIJING_PLACES, beijingPlacesFromText } from '../data/beijingPlaces';
import { parseInterests, parseMinutes } from '../lib/localAgent';
import { runTool } from '../lib/toolExecutor';
import type { AgentToolContext } from './types';

/** 城市路线需要实际的工具结果；不能把模型自行猜测的能力边界当作事实。 */
const CITY_ROUTE_REQUEST = /(路线|规划|怎么逛|安排行程|安排|游玩|逛|半天|一天|小时|下午.*(看|赏|拍)|上午.*(看|赏|拍))/;
const CITY_CAPABILITY_ERROR = /(只覆盖高校|只能.*高校|只能.*校园|不能调用.*城市|没有.*城市.*工具|无法.*城市.*路线)/;

export async function ensureCityRoute(
  userText: string,
  modelText: string,
  context: AgentToolContext,
): Promise<string> {
  if (context.target.kind === 'campus' || !CITY_ROUTE_REQUEST.test(userText) || /(删除|去掉|移除|取消)/.test(userText)) return modelText;

  const districts = context.target.districtIds ?? [];
  const wantsGinkgo = userText.includes('银杏');
  const ginkgoPlaces = wantsGinkgo
    ? BEIJING_PLACES.filter((place) =>
        (!districts.length || districts.includes(place.districtId)) &&
        (place.name.includes('银杏') || place.highlights.some((highlight) => highlight.includes('银杏'))),
      )
    : [];

  if (wantsGinkgo) {
    const listed = JSON.parse(await runTool('list_beijing_places', JSON.stringify({
      keyword: '银杏', district_ids: districts, interests: [],
    }), context)) as { count?: number };
    if (!listed.count) {
      context.beijingPlan = null;
      context.beijingPlanOptions = null;
      return `目前${context.target.label}的城市点位库未收录明确标注银杏的地点，不能据此生成赏银杏路线。可以放宽区域，或改为普通公园路线；当天叶色和开放情况需向园方确认。`;
    }
  }

  const plannedIds = context.beijingPlan
    ? [context.beijingPlan.origin.id, ...context.beijingPlan.stops.map((stop) => stop.place.id)]
    : [];
  const missingGinkgo = wantsGinkgo && !ginkgoPlaces.some((place) => plannedIds.includes(place.id));
  const wrongStartHour = /下午|傍晚/.test(userText) && context.beijingPlanOptions?.startHour !== 14;
  const builtThisTurn = context.trace.some((entry) => entry.startsWith('build_beijing_route('));
  if (builtThisTurn && context.beijingPlan && !missingGinkgo && !wrongStartHour && !CITY_CAPABILITY_ERROR.test(modelText)) return modelText;

  const namedIds = beijingPlacesFromText(userText)
    .filter((place) => !districts.length || districts.includes(place.districtId))
    .map((place) => place.id);
  const selectedIds = Array.from(new Set([...namedIds, ...ginkgoPlaces.map((place) => place.id)]));
  const minutes = parseMinutes(userText) ?? context.beijingPlanOptions?.minutes ?? 240;
  const interests = parseInterests(userText);
  const result = JSON.parse(await runTool('build_beijing_route', JSON.stringify({
    minutes, interests, district_ids: districts,
    include_place_ids: selectedIds,
    start_place_id: selectedIds[0] ?? '',
    start_hour: /下午|傍晚/.test(userText) ? 14 : 9,
    pace: 'normal', travel_mode: 'mixed',
  }), context)) as { error?: string };
  if (result.error || !context.beijingPlan) {
    return result.error ?? '暂时无法生成符合条件的北京路线，请调整地点或时长。';
  }
  const plan = context.beijingPlan;
  const stops = [plan.origin, ...plan.stops.map((stop) => stop.place)];
  const seasonalNote = wantsGinkgo
    ? '所选赏叶点位收录有银杏，但当日叶色、开放时间请出发前向园方确认。'
    : '交通时间为估算，开放与预约情况请出发前确认。';
  const diningArea = interests.includes('food')
    ? stops.find((place) => place.category === 'neighborhood' && place.interests.includes('food'))
    : null;
  const diningNote = interests.includes('food')
    ? `可以${diningArea ? `在${diningArea.name}` : '沿线'}预留用餐时间；具体餐馆和营业情况尚未核实。`
    : '';
  return `已生成「${plan.title}」：${stops.map((place, index) => `${index + 1}. ${place.name}`).join(' → ')}。预计 ${Math.round(plan.totalMinutes)} 分钟，点位间约 ${plan.totalDistanceKm} 公里。${diningNote}${seasonalNote}可以在全局计划中调整站点。`;
}
