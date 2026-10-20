import type { BeijingRouteOptions } from '../types';
import { buildBeijingRoute } from './beijingPlanner';
import { cityPlanningPlaces, type PlaceRepository } from './placeRepository';

/** 手动编辑以明确选中的数据库地点为准，地区筛选只用于查找，不应丢弃跨区选择。 */
export async function prepareBeijingRouteEdit(
  repository: PlaceRepository, previous: BeijingRouteOptions, selectedIds: string[], excludedIds: string[],
) {
  const ids = Array.from(new Set(selectedIds));
  if (!ids.length) throw new Error('请至少保留一个北京目的地。');
  if (ids.length > 100) throw new Error('一次最多选择 100 个目的地，请减少站点。');
  const selected = await repository.city({ ids, limit: 100 });
  const byId = new Map(selected.places.map((place) => [place.id, place]));
  if (ids.some((id) => !byId.has(id))) throw new Error('部分已选目的地已不可用，请重新查询后再应用修改。原计划已保留。');
  const districtIds = Array.from(new Set(ids.map((id) => byId.get(id)!.districtId)));
  const options: BeijingRouteOptions = {
    ...previous, districtIds, startPlaceId: ids[0], includePlaceIds: ids,
    excludePlaceIds: Array.from(new Set(excludedIds)).filter((id) => !byId.has(id)),
    preserveSelectedStops: true,
  };
  const nearby = await cityPlanningPlaces(repository, districtIds);
  const places = Array.from(new Map([...nearby, ...selected.places].map((place) => [place.id, place])).values());
  return { plan: buildBeijingRoute(options, places), options };
}
