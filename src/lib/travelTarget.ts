import { campusByText, type CampusId } from '../data/campuses';
import {
  BEIJING_DISTRICTS,
  beijingPlacesFromText,
  districtIdsFromText,
} from '../data/beijingPlaces';
import type { BeijingDistrictId, BeijingPlace } from '../types';

export interface TravelTarget {
  kind: 'city' | 'district' | 'campus';
  label: string;
  campusId?: CampusId;
  districtIds?: BeijingDistrictId[];
  routeSupported: boolean;
  explicit: boolean;
}

export const BEIJING_TARGET: TravelTarget = {
  kind: 'city',
  label: '北京市',
  routeSupported: true,
  explicit: false,
};

/** 兼容旧代码和旧版保存在浏览器中的对话目标。 */
export const HAIDIAN_TARGET: TravelTarget = {
  kind: 'district',
  label: '海淀区',
  districtIds: ['haidian'],
  routeSupported: true,
  explicit: false,
};

const BEIJING_TERMS = /(北京|京城|故宫|天坛|北海|什刹海|雍和宫|南锣鼓巷|鸟巢|水立方|奥林匹克|798|三里屯|颐和园|圆明园|香山|中关村|首钢园|八大处|潭柘寺|卢沟桥|环球度假区|大运河|十三陵|长城|慕田峪|八达岭|古北水镇|十渡|龙庆峡)/;
const ROUTE_EDIT_TERMS = /(加入|增加|添加|删除|去掉|移除|保留|换掉|当前路线|刚才.*路线)/;

/**
 * 目的地解析独立于大模型。显式学校名称具有最高优先级，防止模型把其他学校
 * 错误回退为北林；追问没有再次提地点时沿用上一轮目标。
 */
export function resolveTravelTarget(text: string, previous?: TravelTarget | null,
  knownCityPlaces: Array<BeijingPlace & { aliases?: string[] }> = []): TravelTarget {
  const campus = campusByText(text);
  if (campus) {
    return {
      kind: 'campus',
      label: campus.name,
      campusId: campus.id,
      routeSupported: Boolean(campus.spots?.length),
      explicit: true,
    };
  }
  const places = [...beijingPlacesFromText(text), ...knownCityPlaces.filter((place) =>
    [place.name, ...(place.aliases ?? [])].some((alias) => alias.length >= 2 && text.includes(alias)))];
  const districtIds = districtIdsFromText(text);
  if (places.length || districtIds.length) {
    const detectedIds = Array.from(new Set([
      ...districtIds,
      ...places.map((place) => place.districtId),
    ]));
    const editingExistingCity =
      Boolean(previous) && previous?.kind !== 'campus' && ROUTE_EDIT_TERMS.test(text);
    if (editingExistingCity && previous?.kind === 'city') {
      return { ...previous, explicit: true };
    }
    const ids = editingExistingCity
      ? Array.from(new Set([...(previous?.districtIds ?? []), ...detectedIds]))
      : detectedIds;
    const labels = ids.map(
      (id) => BEIJING_DISTRICTS.find((district) => district.id === id)?.label ?? id,
    );
    return {
      kind: 'district',
      label: labels.join('、'),
      districtIds: ids,
      routeSupported: true,
      explicit: true,
    };
  }
  if (BEIJING_TERMS.test(text)) {
    return { ...BEIJING_TARGET, explicit: true };
  }
  if (previous) return { ...previous, explicit: false };
  return BEIJING_TARGET;
}

export function targetContext(target: TravelTarget): string {
  if (target.kind === 'city' || target.kind === 'district') {
    const districtNote = target.districtIds?.length
      ? `，优先限定行政区：${target.label}`
      : '';
    return `本轮目标范围：北京市城市旅行${districtNote}。使用北京城市路线工具，不要调用校园内部路线工具。`;
  }
  if (!target.routeSupported) {
    return `本轮目标校园：${target.label}。当前没有该校的校内点位数据，禁止调用 build_route、禁止用北林路线替代；请明确说明暂未支持详细校内规划，并建议用户在北京综合地图中查看位置。`;
  }
  return `本轮目标校园：${target.label}（campus_id=${target.campusId}）。调用校园工具时必须使用这个 campus_id，绝不能替换成其他学校。`;
}
