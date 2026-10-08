import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HAIDIAN_CATEGORY_OPTIONS,
  HAIDIAN_CENTER,
  HAIDIAN_SEARCH_TASKS,
  haidianCategoryOf,
  type HaidianPlaceCategory,
} from '../data/haidianPlaces';
import {
  loadAMap,
  readAmapRuntimeConfig,
  type AMapInfoWindowInstance,
  type AMapMapInstance,
  type AMapMarkerInstance,
  type AMapNamespace,
  type AMapPoi,
} from '../lib/amapLoader';

interface HaidianPlace {
  id: string;
  name: string;
  category: HaidianPlaceCategory;
  address: string;
  type: string;
  lng: number;
  lat: number;
}

type CategoryFilter = 'all' | HaidianPlaceCategory;

function normaliseAddress(address: string | string[] | undefined): string {
  if (Array.isArray(address)) return address.join('');
  return address?.trim() || '地址信息暂缺';
}

function parseLocation(location: AMapPoi['location']): [number, number] | null {
  if (typeof location === 'string') {
    const [lng, lat] = location.split(',').map(Number);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  if (!location) return null;
  const lng = typeof location.getLng === 'function' ? location.getLng() : location.lng;
  const lat = typeof location.getLat === 'function' ? location.getLat() : location.lat;
  return typeof lng === 'number' && typeof lat === 'number' ? [lng, lat] : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[char];
  });
}

function searchPlaces(
  AMap: AMapNamespace,
  keyword: string,
  category: HaidianPlaceCategory,
  pageIndex: number,
  pageSize: number,
): Promise<HaidianPlace[]> {
  return new Promise((resolve) => {
    const searcher = new AMap.PlaceSearch({
      city: '北京市',
      citylimit: true,
      pageSize,
      pageIndex,
      extensions: 'base',
    });
    searcher.search(keyword, (status, result) => {
      if (status !== 'complete' || typeof result === 'string') {
        resolve([]);
        return;
      }
      const places = (result.poiList?.pois ?? []).flatMap((poi) => {
        const position = parseLocation(poi.location);
        const name = poi.name?.trim();
        const address = normaliseAddress(poi.address);
        const isHaidian = poi.adname === '海淀区' || address.includes('海淀');
        if (!position || !name || !isHaidian) return [];
        const [lng, lat] = position;
        return [
          {
            id: poi.id || `${category}-${name}-${lng}-${lat}`,
            name,
            category,
            address,
            type: poi.type || haidianCategoryOf(category).label,
            lng,
            lat,
          },
        ];
      });
      resolve(places);
    });
  });
}

function dedupePlaces(places: HaidianPlace[]): HaidianPlace[] {
  const seen = new Map<string, HaidianPlace>();
  places.forEach((place) => {
    const coordinateKey = `${place.name}-${place.lng.toFixed(5)}-${place.lat.toFixed(5)}`;
    const key = place.id || coordinateKey;
    if (!seen.has(key)) seen.set(key, place);
  });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function amapPlaceUrl(place: HaidianPlace): string {
  const params = new URLSearchParams({
    position: `${place.lng},${place.lat}`,
    name: place.name,
    src: 'bfu-smart-travel',
    coordinate: 'gaode',
    callnative: '1',
  });
  return `https://uri.amap.com/marker?${params.toString()}`;
}

export default function HaidianMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMapInstance | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const markersRef = useRef<AMapMarkerInstance[]>([]);
  const infoWindowRef = useRef<AMapInfoWindowInstance | null>(null);
  const [places, setPlaces] = useState<HaidianPlace[]>([]);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const container = mapContainerRef.current;
    if (!container) return undefined;

    const initialise = async () => {
      try {
        const config = readAmapRuntimeConfig();
        const AMap = await loadAMap(config.key, config.securityCode);
        if (!active) return;
        amapRef.current = AMap;
        const map = new AMap.Map(container, {
          center: HAIDIAN_CENTER,
          zoom: 11,
          viewMode: '2D',
        });
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: { right: '16px', bottom: '16px' } }));
        mapRef.current = map;
        infoWindowRef.current = new AMap.InfoWindow({
          content: '',
          offset: new AMap.Pixel(0, -24),
        });
        setMapReady(true);

        const batches = await Promise.all(
          HAIDIAN_SEARCH_TASKS.flatMap((task) =>
            Array.from({ length: task.pages }, (_, index) =>
              searchPlaces(AMap, task.keyword, task.category, index + 1, task.pageSize),
            ),
          ),
        );
        if (!active) return;
        const nextPlaces = dedupePlaces(batches.flat());
        setPlaces(nextPlaces);
        if (!nextPlaces.length) {
          setError('地图已打开，但暂时没有检索到海淀旅行点位，请稍后刷新。');
        }
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : '海淀综合旅行地图加载失败。');
      } finally {
        if (active) setLoading(false);
      }
    };

    void initialise();
    return () => {
      active = false;
      mapRef.current?.destroy();
      mapRef.current = null;
      amapRef.current = null;
      markersRef.current = [];
      infoWindowRef.current = null;
    };
  }, []);

  const filteredPlaces = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return places.filter((place) => {
      const categoryMatches = category === 'all' || place.category === category;
      const queryMatches =
        !needle ||
        place.name.toLocaleLowerCase('zh-CN').includes(needle) ||
        place.address.toLocaleLowerCase('zh-CN').includes(needle) ||
        place.type.toLocaleLowerCase('zh-CN').includes(needle);
      return categoryMatches && queryMatches;
    });
  }, [places, category, query]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryFilter, number>([['all', places.length]]);
    places.forEach((place) => counts.set(place.category, (counts.get(place.category) ?? 0) + 1));
    return counts;
  }, [places]);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedId) ?? null,
    [places, selectedId],
  );

  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map || !mapReady) return;

    if (markersRef.current.length) map.remove(markersRef.current);
    const markers = filteredPlaces.map((place) => {
      const categoryMeta = haidianCategoryOf(place.category);
      const marker = new AMap.Marker({
        position: [place.lng, place.lat],
        title: place.name,
        label: {
          content: `${categoryMeta.emoji} ${categoryMeta.shortLabel}`,
          direction: 'top',
          offset: new AMap.Pixel(0, -4),
        },
      });
      marker.on('click', () => {
        setSelectedId(place.id);
        infoWindowRef.current?.setContent(
          `<div class="haidian-info"><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(
            categoryMeta.label,
          )}</span><p>${escapeHtml(place.address)}</p></div>`,
        );
        infoWindowRef.current?.open(map, [place.lng, place.lat]);
      });
      return marker;
    });
    markersRef.current = markers;
    if (markers.length) {
      map.add(markers);
      map.setFitView(markers, false, [48, 48, 48, 48]);
    }
  }, [filteredPlaces, mapReady]);

  const focusPlace = (place: HaidianPlace) => {
    const categoryMeta = haidianCategoryOf(place.category);
    setSelectedId(place.id);
    mapRef.current?.setZoomAndCenter(15, [place.lng, place.lat]);
    infoWindowRef.current?.setContent(
      `<div class="haidian-info"><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(
        categoryMeta.label,
      )}</span><p>${escapeHtml(place.address)}</p></div>`,
    );
    if (mapRef.current) infoWindowRef.current?.open(mapRef.current, [place.lng, place.lat]);
  };

  return (
    <section className="haidian-map-layout" aria-labelledby="haidian-map-title">
      <div className="haidian-map-main">
        <div className="haidian-map-heading">
          <div>
            <span className="haidian-kicker">海淀综合旅行地图 · 实时点位</span>
            <h2 id="haidian-map-title">发现海淀</h2>
            <p>景点、公园、文博、高校、美食和地铁交通，一张地图集中浏览。</p>
          </div>
          <span className="haidian-count">{loading ? '检索中…' : `${filteredPlaces.length} 个结果`}</span>
        </div>

        <div className="haidian-filter-bar">
          <div className="haidian-category-list" aria-label="旅行点位类型">
            {HAIDIAN_CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={category === option.id ? 'is-active' : ''}
                onClick={() => setCategory(option.id)}
                title={option.description}
              >
                <span aria-hidden="true">{option.emoji}</span>
                {option.label}
                {!loading ? <small>{categoryCounts.get(option.id) ?? 0}</small> : null}
              </button>
            ))}
          </div>
          <label className="haidian-search">
            <span className="sr-only">搜索地点、地址或类型</span>
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索地点或地址"
            />
          </label>
        </div>

        <div className="haidian-map-canvas-wrap">
          <div ref={mapContainerRef} className="haidian-map-canvas" aria-label="海淀区综合旅行地图" />
          {loading ? <div className="haidian-map-status">正在加载海淀旅行点位…</div> : null}
          {error ? (
            <div className="haidian-map-status haidian-map-status--error">
              <strong>地图暂时不可用</strong>
              <span>{error}</span>
              <small>请在 GitHub Actions 中配置 AMAP_JS_KEY 和 AMAP_SECURITY_CODE 后重新部署。</small>
            </div>
          ) : null}
        </div>

        <p className="haidian-map-note">
          数据由高德地图运行时检索并限定在海淀区；点位用于旅行发现，营业状态和开放信息请以场所官方通知为准。
        </p>
      </div>

      <aside className="haidian-place-panel" aria-label="旅行地点列表">
        <div className="haidian-panel-head">
          <div>
            <strong>地点列表</strong>
            <span>海淀区 · 当前筛选</span>
          </div>
          {query || category !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('all');
              }}
            >
              清除筛选
            </button>
          ) : null}
        </div>

        {selectedPlace ? (
          <div className="haidian-selected-place">
            <span>{haidianCategoryOf(selectedPlace.category).emoji}</span>
            <div>
              <strong>{selectedPlace.name}</strong>
              <small>{selectedPlace.address}</small>
            </div>
            <a href={amapPlaceUrl(selectedPlace)} target="_blank" rel="noreferrer">
              高德查看
            </a>
          </div>
        ) : null}

        <div className="haidian-place-list">
          {filteredPlaces.map((place) => (
            <button
              key={place.id}
              type="button"
              className={selectedId === place.id ? 'is-active' : ''}
              onClick={() => focusPlace(place)}
            >
              <span className={`place-category-dot place-category-dot--${place.category}`} />
              <span>
                <strong>{place.name}</strong>
                <small>{place.address}</small>
              </span>
              <i>{haidianCategoryOf(place.category).shortLabel}</i>
            </button>
          ))}
          {!loading && !filteredPlaces.length && !error ? (
            <div className="haidian-empty">没有符合条件的地点，请换个关键词或分类。</div>
          ) : null}
        </div>
      </aside>
    </section>
  );
}
