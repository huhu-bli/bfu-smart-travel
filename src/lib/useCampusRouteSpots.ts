import { useEffect, useState } from 'react';
import type { CampusGlobalRoutePlan, Spot } from '../types';
import { campusRouteSpots } from './campusRouteEditor';
import { databasePlaces } from './placeRepository';

export function useCampusRouteSpots(route: CampusGlobalRoutePlan) {
  const [result, setResult] = useState<{ route: CampusGlobalRoutePlan; spots?: Spot[]; error?: string }>();
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void campusRouteSpots(databasePlaces, route, controller.signal).then((spots) => {
      if (active) setResult({ route, spots });
    }).catch((error: unknown) => {
      if (active) setResult({ route, error: error instanceof Error ? error.message : '校园资料查询失败。' });
    });
    return () => { active = false; controller.abort(); };
  }, [route]);
  return result?.route === route ? result : undefined;
}
