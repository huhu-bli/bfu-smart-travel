import { cityPlanningPlaces, databasePlaces, type PlaceRepository } from './placeRepository';
import { resolveTravelTarget, type TravelTarget } from './travelTarget';

/** 新增城市点位无需再写进前端常量；只有不明确的旅行请求才补查资料。 */
export async function resolveDatabaseTravelTarget(
  text: string, previous?: TravelTarget | null, repository: PlaceRepository = databasePlaces,
): Promise<TravelTarget> {
  const target = resolveTravelTarget(text, previous);
  if (target.explicit || !/(去|逛|游览|规划|安排|换|改|加入)/.test(text)) return target;
  const places = (await cityPlanningPlaces(repository, [])).filter((place) =>
    [place.name, ...(place.aliases ?? [])].some((alias) => {
      if (alias.length < 2) return false;
      let index = text.indexOf(alias);
      while (index !== -1) {
        const prefix = text.slice(0, index).split(/[，,。.!！?？；;\n]/).pop() ?? '';
        if (!/(?:不要|不想|别|不去|排除|去掉|删除|移除)(?:再|去|逛|到|用|前往|选择|\s)*$/.test(prefix)) return true;
        index = text.indexOf(alias, index + alias.length);
      }
      return false;
    }));
  return resolveTravelTarget(text, previous, places);
}

export function sameTravelTarget(a: TravelTarget, b?: TravelTarget | null): boolean {
  return Boolean(b && a.kind === b.kind && a.campusId === b.campusId &&
    (a.districtIds ?? []).join(',') === (b.districtIds ?? []).join(','));
}
