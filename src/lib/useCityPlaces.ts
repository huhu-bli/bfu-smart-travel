import { useEffect, useState } from 'react';
import { databasePlaces, type CatalogCityPlace, type PlaceFilters } from './placeRepository';

export function useCityPlaces(filters: PlaceFilters = {}) {
  const query = JSON.stringify(filters);
  const [places, setPlaces] = useState<CatalogCityPlace[]>([]);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError(''); setPlaces([]);
    setLoading(true); setTotal(0);
    const timer = window.setTimeout(() => {
      void databasePlaces.city(JSON.parse(query) as PlaceFilters, controller.signal).then((page) => {
        if (active) { setPlaces(page.places); setTotal(page.total); }
      }).catch((reason: unknown) => {
        if (active) { setError(reason instanceof Error ? reason.message : '景点查询失败。'); setTotal(0); }
      }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [query, retry]);
  return { places, error, total, loading, reload: () => setRetry((value) => value + 1) };
}
