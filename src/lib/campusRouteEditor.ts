import { campusById } from '../data/campuses';
import type { CampusGlobalRoutePlan, PlanOptions, Spot } from '../types';
import { buildRoute } from './planner';
import type { PlaceRepository } from './placeRepository';

/** 未标记来源的历史计划按数据库处理，不能猜测为静态副本。 */
export function campusSpotSource(route: CampusGlobalRoutePlan) {
  return route.spotSource ?? 'database';
}

export async function campusRouteSpots(repository: PlaceRepository, route: CampusGlobalRoutePlan, signal?: AbortSignal): Promise<Spot[]> {
  const campusId = route.options.campusId ?? 'bfu';
  const campus = campusById(campusId);
  if (!campus) throw new Error('未找到当前校园，请重新选择学校。');
  if (campusSpotSource(route) === 'static') {
    if (!campus.spots?.length) throw new Error('当前校园没有离线导览资料。');
    return campus.spots;
  }
  const spots: Spot[] = [];
  let total = 0;
  do {
    const page = await repository.campus(campusId, { offset: spots.length, limit: 100 }, signal);
    if (page.places.some((spot) => spot.campusId !== campusId)) throw new Error('校园资料范围不一致，原计划已保留。');
    total = page.total;
    if (!page.places.length && spots.length < total) throw new Error('校园资料分页不完整，请重新查询。');
    spots.push(...page.places);
  } while (spots.length < total);
  if (!spots.length) throw new Error('当前校园暂无可用点位，原计划已保留。');
  return spots;
}

/** 重新生成与增删使用同一来源；失败时由调用者保留原计划。 */
export async function prepareCampusRoute(
  repository: PlaceRepository,
  route: CampusGlobalRoutePlan,
  draft: PlanOptions,
  selectedIds?: string[],
) {
  const campusId = route.options.campusId ?? 'bfu';
  if ((draft.campusId ?? 'bfu') !== campusId) throw new Error('不能在编辑时更换路线所属学校。');
  const spots = await campusRouteSpots(repository, route);
  const ids = new Set(spots.map((spot) => spot.id));
  const selected = Array.from(new Set(selectedIds ?? draft.includeSpotIds ?? []));
  if (!ids.has(draft.startId) || selected.some((id) => !ids.has(id))) {
    throw new Error('起点或已选点位已不可用，请调整选择后重试。原计划已保留。');
  }
  const options: PlanOptions = {
    ...draft,
    campusId,
    campusLabel: campusById(campusId)!.shortName,
    includeSpotIds: selected,
    excludeSpotIds: selectedIds === undefined ? draft.excludeSpotIds : spots
      .filter((spot) => spot.kind !== '入口' && spot.id !== draft.startId && !selected.includes(spot.id))
      .map((spot) => spot.id),
  };
  return { options, plan: buildRoute(spots, options), spotSource: campusSpotSource(route) };
}
