import { useEffect, useState } from 'react';
import { databasePlaces, type CatalogCityPlace, type PlaceFilters } from './placeRepository';

export function useCityPlaces(filters: PlaceFilters = {}) {
  const query = JSON.stringify(filters);
  const [places, setPlaces] = useState<CatalogCityPlace[]>([]);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let active = true;
    setError(''); setPlaces([]);
    const timer = window.setTimeout(() => {
      void databasePlaces.city(JSON.parse(query) as PlaceFilters).then((page) => {
        if (active) { setPlaces(page.places); setTotal(page.total); }
      }).catch((reason: unknown) => {
        if (active) { setError(reason instanceof Error ? reason.message : '景点查询失败。'); setTotal(0); }
      });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  return { places, error, total };
}
