import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HAIDIAN_CENTER,
  SCHOOL_CATEGORY_OPTIONS,
  SCHOOL_SEARCH_TASKS,
  schoolCategoryLabel,
  type SchoolCategory,
} from '../data/haidianSchools';
import {
  loadAMap,
  readAmapRuntimeConfig,
  type AMapInfoWindowInstance,
  type AMapMapInstance,
  type AMapMarkerInstance,
  type AMapNamespace,
  type AMapPoi,
} from '../lib/amapLoader';

interface SchoolPoint {
  id: string;
  name: string;
  category: SchoolCategory;
  address: string;
  type: string;
  lng: number;
  lat: number;
}

type CategoryFilter = 'all' | SchoolCategory;

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

function searchSchools(
  AMap: AMapNamespace,
  keyword: string,
  category: SchoolCategory,
  pageIndex: number,
): Promise<SchoolPoint[]> {
  return new Promise((resolve) => {
    const searcher = new AMap.PlaceSearch({
      city: '北京市',
      citylimit: true,
      pageSize: 50,
      pageIndex,
      extensions: 'base',
    });
    searcher.search(keyword, (status, result) => {
      if (status !== 'complete' || typeof result === 'string') {
        resolve([]);
        return;
      }
      const schools = (result.poiList?.pois ?? []).flatMap((poi) => {
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
            type: poi.type || schoolCategoryLabel(category),
            lng,
            lat,
          },
        ];
      });
      resolve(schools);
    });
  });
}

function dedupeSchools(schools: SchoolPoint[]): SchoolPoint[] {
  const seen = new Map<string, SchoolPoint>();
  schools.forEach((school) => {
    const key = school.id || `${school.name}-${school.lng.toFixed(5)}-${school.lat.toFixed(5)}`;
    if (!seen.has(key)) seen.set(key, school);
  });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export default function HaidianMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMapInstance | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const markersRef = useRef<AMapMarkerInstance[]>([]);
  const infoWindowRef = useRef<AMapInfoWindowInstance | null>(null);
  const [schools, setSchools] = useState<SchoolPoint[]>([]);
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

        const pages = [1, 2];
        const batches = await Promise.all(
          SCHOOL_SEARCH_TASKS.flatMap((task) =>
            pages.map((page) => searchSchools(AMap, task.keyword, task.category, page)),
          ),
        );
        if (!active) return;
        const nextSchools = dedupeSchools(batches.flat());
        setSchools(nextSchools);
        if (!nextSchools.length) {
          setError('地图已打开，但暂时没有检索到海淀学校，请稍后刷新。');
        }
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : '海淀地图加载失败。');
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

  const filteredSchools = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return schools.filter((school) => {
      const categoryMatches = category === 'all' || school.category === category;
      const queryMatches =
        !needle ||
        school.name.toLocaleLowerCase('zh-CN').includes(needle) ||
        school.address.toLocaleLowerCase('zh-CN').includes(needle);
      return categoryMatches && queryMatches;
    });
  }, [schools, category, query]);

  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map || !mapReady) return;

    if (markersRef.current.length) map.remove(markersRef.current);
    const markers = filteredSchools.map((school) => {
      const marker = new AMap.Marker({
        position: [school.lng, school.lat],
        title: school.name,
        label: {
          content: schoolCategoryLabel(school.category).slice(0, 2),
          direction: 'top',
          offset: new AMap.Pixel(0, -4),
        },
      });
      marker.on('click', () => {
        setSelectedId(school.id);
        infoWindowRef.current?.setContent(
          `<div class="haidian-info"><strong>${escapeHtml(school.name)}</strong><span>${escapeHtml(
            schoolCategoryLabel(school.category),
          )}</span><p>${escapeHtml(school.address)}</p></div>`,
        );
        infoWindowRef.current?.open(map, [school.lng, school.lat]);
      });
      return marker;
    });
    markersRef.current = markers;
    if (markers.length) {
      map.add(markers);
      map.setFitView(markers, false, [48, 48, 48, 48]);
    }
  }, [filteredSchools, mapReady]);

  const focusSchool = (school: SchoolPoint) => {
    setSelectedId(school.id);
    mapRef.current?.setZoomAndCenter(15, [school.lng, school.lat]);
    infoWindowRef.current?.setContent(
      `<div class="haidian-info"><strong>${escapeHtml(school.name)}</strong><span>${escapeHtml(
        schoolCategoryLabel(school.category),
      )}</span><p>${escapeHtml(school.address)}</p></div>`,
    );
    if (mapRef.current) infoWindowRef.current?.open(mapRef.current, [school.lng, school.lat]);
  };

  return (
    <section className="haidian-map-layout" aria-labelledby="haidian-map-title">
      <div className="haidian-map-main">
        <div className="haidian-map-heading">
          <div>
            <span className="haidian-kicker">海淀教育地图 · 实时点位</span>
            <h2 id="haidian-map-title">海淀学校总览</h2>
            <p>按学校类型筛选并搜索，点击地图标记或右侧列表查看位置。</p>
          </div>
          <span className="haidian-count">{loading ? '检索中…' : `${filteredSchools.length} 个结果`}</span>
        </div>

        <div className="haidian-filter-bar">
          <div className="haidian-category-list" aria-label="学校类型">
            {SCHOOL_CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={category === option.id ? 'is-active' : ''}
                onClick={() => setCategory(option.id)}
              >
                <span aria-hidden="true">{option.emoji}</span>
                {option.label}
              </button>
            ))}
          </div>
          <label className="haidian-search">
            <span className="sr-only">搜索学校或地址</span>
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索学校或地址"
            />
          </label>
        </div>

        <div className="haidian-map-canvas-wrap">
          <div ref={mapContainerRef} className="haidian-map-canvas" aria-label="海淀区学校地图" />
          {loading ? <div className="haidian-map-status">正在加载海淀学校点位…</div> : null}
          {error ? (
            <div className="haidian-map-status haidian-map-status--error">
              <strong>地图暂时不可用</strong>
              <span>{error}</span>
              <small>请在 GitHub Actions 中配置 AMAP_JS_KEY 和 AMAP_SECURITY_CODE 后重新部署。</small>
            </div>
          ) : null}
        </div>

        <p className="haidian-map-note">
          数据由高德地图运行时检索，结果会随地图服务更新；这是点位总览，不替代教育部门的正式学校名录。
        </p>
      </div>

      <aside className="haidian-school-panel" aria-label="学校列表">
        <div className="haidian-panel-head">
          <div>
            <strong>学校列表</strong>
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
        <div className="haidian-school-list">
          {filteredSchools.map((school) => (
            <button
              key={school.id}
              type="button"
              className={selectedId === school.id ? 'is-active' : ''}
              onClick={() => focusSchool(school)}
            >
              <span className={`school-category-dot school-category-dot--${school.category}`} />
              <span>
                <strong>{school.name}</strong>
                <small>{school.address}</small>
              </span>
              <i>{schoolCategoryLabel(school.category)}</i>
            </button>
          ))}
          {!loading && !filteredSchools.length && !error ? (
            <div className="haidian-empty">没有符合条件的学校，请换个关键词或分类。</div>
          ) : null}
        </div>
      </aside>
    </section>
  );
}
