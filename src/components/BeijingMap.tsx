import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BEIJING_CATEGORY_LABELS,
  BEIJING_CENTER,
  BEIJING_DISTRICTS,
  BEIJING_PLACES,
} from '../data/beijingPlaces';
import {
  loadAMap,
  readAmapRuntimeConfig,
  type AMapInfoWindowInstance,
  type AMapMapInstance,
  type AMapMarkerInstance,
  type AMapNamespace,
  type AMapPolylineInstance,
} from '../lib/amapLoader';
import type { BeijingDistrictId, BeijingPlaceCategory, BeijingRoutePlan } from '../types';

interface Props {
  plan?: BeijingRoutePlan | null;
}

type DistrictFilter = 'all' | BeijingDistrictId;
type CategoryFilter = 'all' | BeijingPlaceCategory;

const CATEGORY_OPTIONS: Array<{ id: CategoryFilter; label: string; emoji: string }> = [
  { id: 'all', label: '全部', emoji: '🧭' },
  { id: 'heritage', label: '历史古迹', emoji: '🏯' },
  { id: 'museum', label: '文博场馆', emoji: '🏛️' },
  { id: 'park', label: '公园自然', emoji: '🌳' },
  { id: 'landmark', label: '城市地标', emoji: '📍' },
  { id: 'university', label: '高校', emoji: '🎓' },
  { id: 'neighborhood', label: '街区', emoji: '🏘️' },
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char] ?? char));
}

function amapPlaceUrl(name: string, lng: number, lat: number): string {
  const params = new URLSearchParams({
    position: `${lng},${lat}`,
    name,
    src: 'beijing-smart-travel',
    coordinate: 'gaode',
    callnative: '1',
  });
  return `https://uri.amap.com/marker?${params.toString()}`;
}

export default function BeijingMap({ plan = null }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMapInstance | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const markersRef = useRef<AMapMarkerInstance[]>([]);
  const routeLineRef = useRef<AMapPolylineInstance | null>(null);
  const infoRef = useRef<AMapInfoWindowInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [district, setDistrict] = useState<DistrictFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const routeIds = useMemo(
    () => new Set(plan ? [plan.origin.id, ...plan.stops.map((stop) => stop.place.id)] : []),
    [plan],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return BEIJING_PLACES.filter((place) => {
      const categoryHit = category === 'all' || place.category === category;
      const districtHit = district === 'all' || place.districtId === district;
      const queryHit =
        !needle ||
        place.name.toLocaleLowerCase('zh-CN').includes(needle) ||
        place.district.includes(needle) ||
        place.highlights.some((item) => item.includes(needle));
      return categoryHit && districtHit && queryHit;
    });
  }, [category, district, query]);

  const selected = BEIJING_PLACES.find((place) => place.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    const container = containerRef.current;
    if (!container) return undefined;
    void (async () => {
      try {
        const config = readAmapRuntimeConfig();
        const AMap = await loadAMap(config.key, config.securityCode);
        if (!active) return;
        amapRef.current = AMap;
        const map = new AMap.Map(container, { center: BEIJING_CENTER, zoom: 9, viewMode: '2D' });
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: { right: '16px', bottom: '16px' } }));
        mapRef.current = map;
        infoRef.current = new AMap.InfoWindow({ content: '', offset: new AMap.Pixel(0, -24) });
        setReady(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '北京地图加载失败。');
      }
    })();
    return () => {
      active = false;
      mapRef.current?.destroy();
      mapRef.current = null;
      amapRef.current = null;
      markersRef.current = [];
      routeLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map || !ready) return;
    if (markersRef.current.length) map.remove(markersRef.current);
    if (routeLineRef.current) map.remove(routeLineRef.current);

    const orderedRoute = plan ? [plan.origin, ...plan.stops.map((stop) => stop.place)] : [];
    const order = new Map(orderedRoute.map((place, index) => [place.id, index + 1]));
    const markers = filtered.map((place) => {
      const sequence = order.get(place.id);
      const marker = new AMap.Marker({
        position: [place.lng, place.lat],
        title: place.name,
        label: {
          content: sequence ? `${sequence} · ${place.name}` : `${place.emoji} ${place.name}`,
          direction: 'top',
          offset: new AMap.Pixel(0, -4),
        },
      });
      marker.on('click', () => {
        setSelectedId(place.id);
        infoRef.current?.setContent(
          `<div class="haidian-info"><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(place.district)} · ${escapeHtml(BEIJING_CATEGORY_LABELS[place.category])}</span><p>${escapeHtml(place.short)}</p></div>`,
        );
        infoRef.current?.open(map, [place.lng, place.lat]);
      });
      return marker;
    });
    markersRef.current = markers;
    if (markers.length) map.add(markers);

    if (orderedRoute.length > 1) {
      const routeLine = new AMap.Polyline({
        path: orderedRoute.map((place) => [place.lng, place.lat]),
        strokeColor: '#2563eb',
        strokeWeight: 6,
        strokeOpacity: 0.82,
        showDir: true,
      });
      routeLineRef.current = routeLine;
      map.add(routeLine);
      map.setFitView([...markers.filter((_, index) => routeIds.has(filtered[index].id)), routeLine], false, [72, 72, 72, 72]);
    } else if (markers.length) {
      map.setFitView(markers, false, [56, 56, 56, 56]);
    }
  }, [filtered, plan, ready, routeIds]);

  const focus = (id: string) => {
    const place = BEIJING_PLACES.find((item) => item.id === id);
    if (!place) return;
    setSelectedId(id);
    mapRef.current?.setZoomAndCenter(14, [place.lng, place.lat]);
  };

  return (
    <div className="haidian-map-layout">
      <section className="haidian-map-main">
        <div className="haidian-map-heading">
          <div>
            <span className="haidian-kicker">BEIJING CITY MAP</span>
            <h2>北京综合旅行地图</h2>
            <p>覆盖 16 个行政区的代表性景点；蓝色编号为当前计划站点。</p>
          </div>
          <span className="haidian-count">{filtered.length} 个点位</span>
        </div>

        <div className="haidian-filter-bar">
          <div className="haidian-category-list">
            {CATEGORY_OPTIONS.map((item) => (
              <button key={item.id} type="button" className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)}>
                {item.emoji} {item.label}
              </button>
            ))}
          </div>
          <label className="haidian-search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索景点或主题" />
          </label>
        </div>

        <label className="beijing-district-filter">
          <span>行政区</span>
          <select value={district} onChange={(event) => setDistrict(event.target.value as DistrictFilter)}>
            <option value="all">北京市全域</option>
            {BEIJING_DISTRICTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>

        <div className="haidian-map-canvas-wrap">
          <div ref={containerRef} className="haidian-map-canvas" />
          {!ready && !error ? <div className="haidian-map-status"><span>正在加载北京地图…</span></div> : null}
          {error ? <div className="haidian-map-status haidian-map-status--error"><strong>地图暂时无法加载</strong><span>{error}</span></div> : null}
        </div>
        <p className="haidian-map-note">路线连线用于展示站点顺序，不代表实际道路；请在出发前使用地图导航确认换乘和实时路况。</p>
      </section>

      <aside className="haidian-place-panel">
        <div className="haidian-panel-head">
          <div><strong>{plan ? '当前北京路线' : '北京目的地'}</strong><span>{plan ? plan.title : '点击点位查看位置'}</span></div>
        </div>
        <div className="haidian-place-list">
          {(plan ? [plan.origin, ...plan.stops.map((stop) => stop.place)] : filtered.slice(0, 30)).map((place, index) => (
            <button key={place.id} type="button" className={selectedId === place.id ? 'haidian-place-item is-active' : 'haidian-place-item'} onClick={() => focus(place.id)}>
              <span className="haidian-place-icon">{plan ? index + 1 : place.emoji}</span>
              <span><strong>{place.name}</strong><small>{place.district} · {BEIJING_CATEGORY_LABELS[place.category]}</small></span>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="haidian-selection">
            <strong>{selected.emoji} {selected.name}</strong>
            <p>{selected.short}</p>
            <a href={amapPlaceUrl(selected.name, selected.lng, selected.lat)} target="_blank" rel="noreferrer">在高德地图中打开</a>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

