import { useEffect, useMemo, useRef, useState } from 'react';
import AgentPanel from './components/AgentPanel';
import BeijingMap from './components/BeijingMap';
import BeijingRouteResult from './components/BeijingRouteResult';
import CampusMap from './components/CampusMap';
import Checklist from './components/Checklist';
import Footer from './components/Footer';
import GlobalRoutePlanBar from './components/GlobalRoutePlanBar';
import Header, { type TabId } from './components/Header';
import Planner from './components/Planner';
import RouteResult from './components/RouteResult';
import SpotDetail from './components/SpotDetail';
import SpotsGallery from './components/SpotsGallery';
import PlaceCatalog from './components/PlaceCatalog';
import Trips from './components/Trips';
import { DURATIONS, PACES } from './data/interests';
import { SPOTS } from './data/spots';
import { campusById } from './data/campuses';
import { buildBeijingRoute } from './lib/beijingPlanner';
import { databasePlaces, cityPlanningPlaces, type CatalogCityPlace } from './lib/placeRepository';
import { refineBeijingRouteWithAmap } from './lib/routeProviders/amap';
import { buildRoute, formatDuration } from './lib/planner';
import { toggleInList, useLocalStorage } from './lib/storage';
import { decodeStoredGlobalRoute } from './lib/storedState';
import { createRouteUpdateGate } from './lib/routeUpdateGate';
import { prepareBeijingRouteEdit } from './lib/beijingRouteEditor';
import { prepareCampusRoute } from './lib/campusRouteEditor';
import { useCampusRouteSpots } from './lib/useCampusRouteSpots';
import type {
  BeijingRouteOptions,
  BeijingRoutePlan,
  CampusGlobalRoutePlan,
  GlobalRoutePlan,
  InterestId,
  PaceId,
  PlanOptions,
  RoutePlan,
  Spot,
} from './types';

const REPO_URL = 'https://github.com/huhu-bli/bfu-smart-travel';

export default function App() {
  const [tab, setTab] = useState<TabId>('planner');
  const [interestIds] = useLocalStorage<InterestId[]>('interests', [
    'plant',
    'culture',
    'photo',
  ]);
  const [durationId] = useLocalStorage<string>('duration', '60');
  const [paceId] = useLocalStorage<PaceId>('pace', 'normal');
  const [startId] = useLocalStorage<string>('start', 'gate-main');
  const [favorites, setFavorites] = useLocalStorage<string[]>('favorites', []);
  const [activeSpotId, setActiveSpotId] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [galleryScope, setGalleryScope] = useState<'database' | 'campus'>('database');
  const [catalogPlanError, setCatalogPlanError] = useState('');
  const [mapScope, setMapScope] = useState<'campus' | 'beijing'>('campus');
  const routeUpdates = useRef(createRouteUpdateGate());
  const [routeUpdating, setRouteUpdating] = useState(false);
  const invalidateRouteUpdate = () => {
    routeUpdates.current.invalidate();
    setRouteUpdating(false);
    setCatalogPlanError('');
  };

  const options = useMemo(() => {
    const duration = DURATIONS.find((item) => item.id === durationId) ?? DURATIONS[1];
    const pace = PACES.find((item) => item.id === paceId) ?? PACES[1];
    return {
      campusId: 'bfu' as const,
      campusLabel: '北林',
      interests: interestIds,
      minutes: duration.minutes,
      pace,
      startId,
    };
  }, [interestIds, durationId, paceId, startId]);

  const [globalRoute, setGlobalRoute] = useLocalStorage<GlobalRoutePlan>('global-route-plan:v1', {
    kind: 'campus',
    spotSource: 'static',
    plan: buildRoute(SPOTS, options),
    options,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  }, decodeStoredGlobalRoute);
  const fallbackCampusRoute = useMemo<CampusGlobalRoutePlan>(() => ({
    kind: 'campus',
    spotSource: 'static',
    plan: buildRoute(SPOTS, options),
    options,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  }), [options]);
  // 城市路线保留校园手动入口的独立默认计划；旧缓存由读取层迁移。
  const campusRoute = globalRoute.kind === 'beijing'
    ? fallbackCampusRoute
    : globalRoute;
  const plan = campusRoute.plan;
  const activeOptions = campusRoute.options;
  const activeCampus = campusById(activeOptions.campusId ?? 'bfu');
  const catalog = useCampusRouteSpots(campusRoute);
  const activeSpots = useMemo<Spot[]>(() => catalog?.spots ?? Array.from(new Map(
    [plan.origin, ...plan.stops.map((stop) => stop.spot), ...plan.optionalStops.map((stop) => stop.spot)]
      .map((spot) => [spot.id, spot]),
  ).values()), [catalog, plan]);
  const [draft, setDraft] = useState<PlanOptions>(activeOptions);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setDraft(activeOptions); setDirty(false); }, [activeOptions]);
  const changeDraft = (patch: Partial<PlanOptions>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  useEffect(() => () => routeUpdates.current.invalidate(), []);

  const updateCampusRoute = (nextOptions: PlanOptions, selectedIds?: string[]) => {
    const revision = routeUpdates.current.begin();
    if (revision === undefined) return;
    setRouteUpdating(true);
    setCatalogPlanError('');
    void prepareCampusRoute(databasePlaces, campusRoute, nextOptions, selectedIds).then((result) => {
      if (!routeUpdates.current.isCurrent(revision)) return;
      setGlobalRoute({ kind: 'campus', ...result, source: 'manual', updatedAt: new Date().toISOString() });
      setDirty(false);
      if (selectedIds === undefined) window.setTimeout(() => {
        document.getElementById('route-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    }).catch((error: unknown) => {
      if (routeUpdates.current.isCurrent(revision)) setCatalogPlanError(error instanceof Error ? error.message : '路线更新失败，原计划已保留。');
    }).finally(() => {
      if (routeUpdates.current.finish(revision)) setRouteUpdating(false);
    });
  };

  const generate = () => updateCampusRoute(draft);
  const selectStart = (id: string) => {
    changeDraft({ startId: id });
    setTab('planner');
  };

  /** Agent 一旦生成有效路线就写入全局计划；查看按钮只负责把用户带到编辑器。 */
  const savePlanFromAgent = (nextPlan: RoutePlan, nextOptions: PlanOptions) => {
    invalidateRouteUpdate();
    setGlobalRoute({
      kind: 'campus',
      plan: nextPlan,
      options: nextOptions,
      source: 'agent',
      spotSource: 'database',
      updatedAt: new Date().toISOString(),
    });
  };

  const applyPlanFromAgent = (nextPlan: RoutePlan, nextOptions: PlanOptions) => {
    savePlanFromAgent(nextPlan, nextOptions);
    setMapScope(nextOptions.campusId === 'bfu' || !nextOptions.campusId ? 'campus' : 'beijing');
    setTab('planner');
    window.setTimeout(() => {
      document.getElementById('route-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const saveBeijingPlanFromAgent = (
    nextPlan: BeijingRoutePlan,
    nextOptions: BeijingRouteOptions,
  ) => {
    invalidateRouteUpdate();
    setGlobalRoute({
      kind: 'beijing',
      plan: nextPlan,
      options: nextOptions,
      source: 'agent',
      updatedAt: new Date().toISOString(),
    });
    setMapScope('beijing');
    setDirty(false);
  };

  const applyBeijingPlanFromAgent = (
    nextPlan: BeijingRoutePlan,
    nextOptions: BeijingRouteOptions,
  ) => {
    saveBeijingPlanFromAgent(nextPlan, nextOptions);
    setMapScope('beijing');
    setTab('planner');
    window.setTimeout(() => {
      document.getElementById('route-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const applyRouteEdits = (nextIncludedIds: string[], _nextExcludedIds: string[]) => {
    updateCampusRoute(activeOptions, nextIncludedIds);
  };

  const applyBeijingRouteEdits = (includePlaceIds: string[], excludePlaceIds: string[]) => {
    if (globalRoute.kind !== 'beijing' || !includePlaceIds.length) return;
    const revision = routeUpdates.current.begin();
    if (revision === undefined) return;
    setRouteUpdating(true);
    setCatalogPlanError('');
    void prepareBeijingRouteEdit(databasePlaces, globalRoute.options, includePlaceIds, excludePlaceIds).then(async ({ plan: estimatedPlan, options: nextOptions }) => {
      if (!routeUpdates.current.isCurrent(revision)) return;
      const source = 'manual';
      setGlobalRoute({
        kind: 'beijing',
        plan: estimatedPlan,
        options: nextOptions,
        source,
        updatedAt: new Date().toISOString(),
      });
      const refinedPlan = await refineBeijingRouteWithAmap(estimatedPlan, nextOptions);
      if (!routeUpdates.current.isCurrent(revision)) return;
      setGlobalRoute({
        kind: 'beijing',
        plan: refinedPlan,
        options: nextOptions,
        source,
        updatedAt: new Date().toISOString(),
      });
    }).catch((error: unknown) => {
      if (routeUpdates.current.isCurrent(revision)) setCatalogPlanError(error instanceof Error ? error.message : '路线更新失败。');
    }).finally(() => {
      if (routeUpdates.current.finish(revision)) setRouteUpdating(false);
    });
  };
  const planFromCatalog = (place: CatalogCityPlace) => {
    const revision = routeUpdates.current.begin();
    if (revision === undefined) return Promise.resolve();
    setRouteUpdating(true);
    setCatalogPlanError('');
    const nextOptions: BeijingRouteOptions = { scope: 'beijing', startHour: 9, minutes: 240,
      interests: place.interests, pace: PACES[1], travelMode: 'mixed', districtIds: [place.districtId],
      startPlaceId: place.id, includePlaceIds: [place.id], excludePlaceIds: [] };
    return cityPlanningPlaces(databasePlaces, nextOptions.districtIds, [place.id]).then(async (places) => {
      const result = await refineBeijingRouteWithAmap(buildBeijingRoute(nextOptions, places), nextOptions);
      if (!routeUpdates.current.isCurrent(revision)) return;
      setGlobalRoute({ kind: 'beijing', plan: result, options: nextOptions, source: 'manual', updatedAt: new Date().toISOString() });
      setMapScope('beijing'); setTab('planner');
    }).catch((error: unknown) => {
      if (routeUpdates.current.isCurrent(revision)) setCatalogPlanError(error instanceof Error ? error.message : '路线生成失败。');
    }).finally(() => {
      if (routeUpdates.current.finish(revision)) setRouteUpdating(false);
    });
  };

  const setExactPlanStops = (spotIds: string[]) => {
    const selected = Array.from(new Set(spotIds));
    const excluded = activeSpots
      .filter((spot) => spot.id !== plan.origin.id && spot.kind !== '入口' && !selected.includes(spot.id))
      .map((spot) => spot.id);
    applyRouteEdits(selected, excluded);
  };

  const removePlanStop = (spotId: string) => {
    if (globalRoute.kind === 'beijing') {
      const current = [globalRoute.plan.origin.id, ...globalRoute.plan.stops.map((stop) => stop.place.id)];
      applyBeijingRouteEdits(
        current.filter((id) => id !== spotId),
        Array.from(new Set([...(globalRoute.options.excludePlaceIds ?? []), spotId])),
      );
      return;
    }
    setExactPlanStops(plan.stops.map((stop) => stop.spot.id).filter((id) => id !== spotId));
  };

  const addOptionalStop = (spotId: string) => {
    if (globalRoute.kind === 'beijing') {
      const current = [globalRoute.plan.origin.id, ...globalRoute.plan.stops.map((stop) => stop.place.id)];
      applyBeijingRouteEdits(
        [...current, spotId],
        (globalRoute.options.excludePlaceIds ?? []).filter((id) => id !== spotId),
      );
      return;
    }
    setExactPlanStops([...plan.stops.map((stop) => stop.spot.id), spotId]);
  };

  const togglePlanSpot = (spotId: string) => {
    const current = plan.stops.map((stop) => stop.spot.id);
    setExactPlanStops(current.includes(spotId) ? current.filter((id) => id !== spotId) : [...current, spotId]);
  };

  const openPlanMap = () => {
    setMapScope(globalRoute.kind === 'beijing' || activeCampus?.mapMode !== 'bfu-svg' ? 'beijing' : 'campus');
    setTab('map');
  };

  const activeSpot = activeSpotId
    ? activeSpots.find((spot) => spot.id === activeSpotId)
      ?? [plan.origin, ...plan.stops.map((stop) => stop.spot), ...plan.optionalStops.map((stop) => stop.spot)]
        .find((spot) => spot.id === activeSpotId) ?? null
    : null;

  return (
    <div className="app">
      <Header tab={tab} onChange={setTab} repoUrl={REPO_URL} />

      <main className="app-main">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="hero-pill">北京全域漫游 · 16 区 · 高校 · 公园 · 文博</span>
            <h1>
              一张地图，
              <br />
              逛遍北京。
            </h1>
            <p>
              先按地区和兴趣查询景点资料，再让 Agent 帮你安排可保存、可增删的旅行路线。
            </p>
            <div className="hero-agent-entry">
              <button type="button" className="hero-agent-btn" onClick={() => { setGalleryScope('database'); setTab('spots'); }}>
                查询景点
              </button>
              <button type="button" className="hero-agent-btn" onClick={() => setAgentOpen(true)}>
                <span aria-hidden="true">🤖</span>
                让 Agent 帮我规划
              </button>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <svg viewBox="0 0 320 260">
              <circle cx="252" cy="62" r="46" fill="#f4d06f" opacity="0.9" />
              <path d="M0 236 C 60 210, 120 226, 180 200 C 240 174, 290 190, 320 176 L 320 260 L 0 260 Z" fill="#163b78" opacity="0.35" />
              <g fill="#ffffff" opacity="0.9">
                <path d="M96 208 L104 120 L112 208 Z" />
                <path d="M72 140 L104 96 L136 140 Z" />
                <path d="M78 168 L104 130 L130 168 Z" />
              </g>
              <g fill="#ffffff" opacity="0.75">
                <path d="M176 212 L183 142 L190 212 Z" />
                <path d="M157 158 L183 122 L209 158 Z" />
              </g>
              <g fill="#f4d06f">
                <circle cx="52" cy="96" r="4" />
                <circle cx="228" cy="128" r="4.5" />
                <circle cx="268" cy="196" r="3.5" />
                <circle cx="140" cy="72" r="3.5" />
              </g>
            </svg>
          </div>
        </section>

        <GlobalRoutePlanBar
          busy={routeUpdating}
          route={globalRoute}
          onOpen={() => setTab('planner')}
          onRemoveStop={removePlanStop}
          onAddOptionalStop={addOptionalStop}
        />
        {routeUpdating ? <p role="status" aria-live="polite">正在更新路线，请稍候再增删目的地…</p> : null}
        {globalRoute.kind === 'campus' && catalog?.error ? <p role="alert">校园资料未能更新：{catalog.error} 重新生成或应用修改时会再次查询。</p> : null}
        {catalogPlanError ? <p role="alert">{catalogPlanError}</p> : null}

        <section className="explore-strip" aria-label="北京探索入口">
          <div className="explore-intro">
            <span className="section-kicker">BEIJING DISCOVERY</span>
            <strong>从校园精细导览，扩展到北京 16 区</strong>
            <p>城市地标、历史古迹、公园、高校与远郊路线，都可以统一进入计划。</p>
          </div>
          <div className="explore-actions">
            <button
              type="button"
              className="explore-card"
              onClick={() => {
                setMapScope('beijing');
                setTab('map');
              }}
            >
              <span className="explore-icon" aria-hidden="true">🗺️</span>
              <span>
                <strong>北京全域</strong>
                <small>浏览 16 区代表性旅行目的地</small>
              </span>
              <span className="explore-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="explore-card" onClick={() => setTab('spots')}>
              <span className="explore-icon" aria-hidden="true">🌿</span>
              <span>
                <strong>校园与景点</strong>
                <small>查看点位图鉴，收藏想去的地方</small>
              </span>
              <span className="explore-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="explore-card" onClick={() => setTab('trips')}>
              <span className="explore-icon" aria-hidden="true">☀️</span>
              <span>
                <strong>路线灵感</strong>
                <small>查看半日游与一日游模板</small>
              </span>
              <span className="explore-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <div className="tab-panel" key={tab}>
          {tab === 'planner' ? (
            globalRoute.kind === 'beijing' ? (
              <BeijingRouteResult
                busy={routeUpdating}
                plan={globalRoute.plan}
                options={globalRoute.options}
                onOpenMap={openPlanMap}
                onEditRoute={applyBeijingRouteEdits}
                onChangeSpending={(spending) => setGlobalRoute((current) => current.kind === 'beijing'
                  ? { ...current, options: { ...current.options, spending }, updatedAt: new Date().toISOString() } : current)}
              />
            ) : (
              <div className="planner-layout">
                <Planner
                  campusLabel={activeCampus?.name ?? activeOptions.campusLabel ?? '当前校园'}
                  gates={activeSpots.filter((spot) => spot.kind === '入口')}
                  busy={routeUpdating}
                  interestIds={draft.interests}
                  onToggleInterest={(id) => changeDraft({ interests: toggleInList(draft.interests, id) })}
                  durationId={String(draft.minutes)}
                  onDuration={(id) => changeDraft({ minutes: Number(id) })}
                  paceId={draft.pace.id}
                  onPace={(id) => changeDraft({ pace: PACES.find((pace) => pace.id === id)! })}
                  startId={draft.startId}
                  onStart={selectStart}
                  onGenerate={generate}
                  dirty={dirty}
                />
                <RouteResult
                  key={`${activeOptions.campusId}:${campusRoute.updatedAt}`}
                  busy={routeUpdating}
                  plan={plan}
                  availableSpots={activeSpots}
                  showCampusMap={activeCampus?.mapMode === 'bfu-svg'}
                  onSelectSpot={setActiveSpotId}
                  onOpenMap={openPlanMap}
                  onEditRoute={applyRouteEdits}
                  excludedSpotIds={activeOptions.excludeSpotIds ?? []}
                />
              </div>
            )
          ) : null}

          {tab === 'map' ? (
            <div className="map-explorer">
              <div className="map-scope-switch" role="group" aria-label="地图范围">
                <button
                  type="button"
                  className={mapScope === 'campus' ? 'is-active' : ''}
                  onClick={() => setMapScope('campus')}
                  disabled={globalRoute.kind === 'beijing' || activeCampus?.mapMode !== 'bfu-svg'}
                  title={globalRoute.kind === 'beijing' || activeCampus?.mapMode !== 'bfu-svg' ? '当前路线没有专用校园底图' : undefined}
                >
                  校园精细地图
                </button>
                <button
                  type="button"
                  className={mapScope === 'beijing' ? 'is-active' : ''}
                  onClick={() => setMapScope('beijing')}
                >
                  北京综合地图
                </button>
              </div>

              {mapScope === 'campus' && globalRoute.kind !== 'beijing' && activeCampus?.mapMode === 'bfu-svg' ? (
                <div className="map-layout">
                  <CampusMap
                    spots={activeSpots}
                    plan={plan}
                    activeId={activeSpotId}
                    onSelect={setActiveSpotId}
                  />
                  <aside className="map-side">
                    <h2>{plan.title}</h2>
                    <p className="route-sub">{plan.subtitle}</p>
                    <ol className="side-stops">
                      <li>
                        <span className="stop-index stop-index--sm">起</span>
                        {plan.origin.name}
                      </li>
                      {plan.stops.map((stop, index) => (
                        <li key={stop.spot.id}>
                          <button type="button" onClick={() => setActiveSpotId(stop.spot.id)}>
                            <span className="stop-index stop-index--sm">{index + 1}</span>
                            {stop.spot.name}
                          </button>
                        </li>
                      ))}
                    </ol>
                    <div className="side-foot">
                      <p>
                        预计 {formatDuration(plan.totalMinutes)} · 步行约 {plan.totalMeters} 米
                      </p>
                      <button type="button" className="ghost-btn" onClick={() => setTab('planner')}>
                        回到规划器
                      </button>
                    </div>
                  </aside>
                </div>
              ) : (
                <BeijingMap plan={globalRoute.kind === 'beijing' ? globalRoute.plan : null} />
              )}
            </div>
          ) : null}

          {tab === 'spots' ? (
            <>
            <div className="map-scope-switch" role="group" aria-label="景点资料范围">
              <button type="button" className={galleryScope === 'database' ? 'is-active' : ''} onClick={() => setGalleryScope('database')}>景点数据库</button>
              <button type="button" className={galleryScope === 'campus' ? 'is-active' : ''} onClick={() => setGalleryScope('campus')}>校园导览</button>
            </div>
            {galleryScope === 'database' ? <PlaceCatalog planBusy={routeUpdating} onPlanCity={planFromCatalog} /> :
            <SpotsGallery
              spots={activeSpots}
              scopeLabel={activeCampus?.shortName ?? activeOptions.campusLabel ?? '当前路线'}
              favorites={favorites}
              plannedSpotIds={plan.stops.map((stop) => stop.spot.id)}
              onToggleFavorite={(id) => setFavorites((prev) => toggleInList(prev, id))}
              onTogglePlanSpot={routeUpdating ? undefined : togglePlanSpot}
              onSelect={setActiveSpotId}
            />
            }
            </>
          ) : null}

          {tab === 'trips' ? <Trips /> : null}
          {tab === 'packing' ? <Checklist /> : null}
        </div>
      </main>

      <Footer repoUrl={REPO_URL} />

      <AgentPanel
        open={agentOpen}
        onOpen={() => setAgentOpen(true)}
        onClose={() => setAgentOpen(false)}
        currentPlan={plan}
        currentPlanOptions={activeOptions}
        currentBeijingPlan={globalRoute.kind === 'beijing' ? globalRoute.plan : null}
        currentBeijingPlanOptions={globalRoute.kind === 'beijing' ? globalRoute.options : null}
        onSelectSpot={setActiveSpotId}
        onPlanGenerated={savePlanFromAgent}
        onApplyPlan={applyPlanFromAgent}
        onBeijingPlanGenerated={saveBeijingPlanFromAgent}
        onApplyBeijingPlan={applyBeijingPlanFromAgent}
        onOpenMap={(scope = 'campus') => {
          setMapScope(scope);
          setTab('map');
        }}
        onOpenTrips={() => setTab('trips')}
      />

      {activeSpot ? (
        <SpotDetail
          spot={activeSpot}
          isFavorite={favorites.includes(activeSpot.id)}
          onToggleFavorite={(id) => setFavorites((prev) => toggleInList(prev, id))}
          onClose={() => setActiveSpotId(null)}
          onUseAsStart={selectStart}
          canUseAsStart={activeSpot.kind === '入口' && !routeUpdating}
        />
      ) : null}
    </div>
  );
}
