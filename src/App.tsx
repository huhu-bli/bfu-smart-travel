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
import Trips from './components/Trips';
import { DURATIONS, GATE_IDS, PACES } from './data/interests';
import { SPOTS, SPOT_MAP } from './data/spots';
import { campusById, spotAcrossCampuses } from './data/campuses';
import { buildBeijingRoute } from './lib/beijingPlanner';
import { refineBeijingRouteWithAmap } from './lib/routeProviders/amap';
import { buildRoute, formatDuration } from './lib/planner';
import { toggleInList, useLocalStorage } from './lib/storage';
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
  const [interestIds, setInterestIds] = useLocalStorage<InterestId[]>('interests', [
    'plant',
    'culture',
    'photo',
  ]);
  const [durationId, setDurationId] = useLocalStorage<string>('duration', '60');
  const [paceId, setPaceId] = useLocalStorage<PaceId>('pace', 'normal');
  const [startId, setStartId] = useLocalStorage<string>('start', 'gate-main');
  const [favorites, setFavorites] = useLocalStorage<string[]>('favorites', []);
  const [activeSpotId, setActiveSpotId] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [mapScope, setMapScope] = useState<'campus' | 'beijing'>('campus');
  const [includedSpotIds, setIncludedSpotIds] = useState<string[]>([]);
  const [excludedSpotIds, setExcludedSpotIds] = useState<string[]>([]);

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
      includeSpotIds: includedSpotIds,
      excludeSpotIds: excludedSpotIds,
    };
  }, [interestIds, durationId, paceId, startId, includedSpotIds, excludedSpotIds]);

  const [globalRoute, setGlobalRoute] = useLocalStorage<GlobalRoutePlan>('global-route-plan:v1', {
    kind: 'campus',
    plan: buildRoute(SPOTS, options),
    options,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  });
  useEffect(() => {
    const savedKind = (globalRoute as GlobalRoutePlan & { kind?: 'campus' | 'beijing' }).kind;
    if (!savedKind) {
      setGlobalRoute({ ...globalRoute, kind: 'campus' } as CampusGlobalRoutePlan);
    }
  }, [globalRoute, setGlobalRoute]);
  const fallbackCampusRoute = useMemo<CampusGlobalRoutePlan>(() => ({
    kind: 'campus',
    plan: buildRoute(SPOTS, options),
    options,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  }), [options]);
  // 兼容升级前 localStorage 中没有 kind 字段的校园计划。
  const campusRoute = globalRoute.kind === 'beijing'
    ? fallbackCampusRoute
    : ({ ...globalRoute, kind: 'campus' } as CampusGlobalRoutePlan);
  const plan = campusRoute.plan;
  const activeOptions = campusRoute.options;
  const activeCampus = campusById(activeOptions.campusId ?? 'bfu');
  const activeSpots = useMemo<Spot[]>(() => {
    if (activeCampus?.spots?.length) return activeCampus.spots;
    const seen = new Set<string>();
    return [plan.origin, ...plan.stops.map((stop) => stop.spot), ...plan.optionalStops.map((stop) => stop.spot)]
      .filter((spot) => {
        if (seen.has(spot.id)) return false;
        seen.add(spot.id);
        return true;
      });
  }, [activeCampus, plan]);
  const [dirty, setDirty] = useState(false);
  const firstRender = useRef(true);
  const skipDirty = useRef(false);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (skipDirty.current) {
      skipDirty.current = false;
      return;
    }
    setDirty(true);
  }, [options]);

  const generate = () => {
    setGlobalRoute({
      kind: 'campus',
      plan: buildRoute(SPOTS, options),
      options,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    });
    setDirty(false);
    window.setTimeout(() => {
      document.getElementById('route-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const selectStart = (id: string) => {
    setStartId(id);
    setTab('planner');
  };

  /** Agent 一旦生成有效路线就写入全局计划；查看按钮只负责把用户带到编辑器。 */
  const savePlanFromAgent = (nextPlan: RoutePlan, nextOptions: PlanOptions) => {
    setGlobalRoute({
      kind: 'campus',
      plan: nextPlan,
      options: nextOptions,
      source: 'agent',
      updatedAt: new Date().toISOString(),
    });
    skipDirty.current = true;
    setDirty(false);
    if (!nextOptions.campusId || nextOptions.campusId === 'bfu') {
      setIncludedSpotIds(nextOptions.includeSpotIds ?? nextPlan.stops.map((stop) => stop.spot.id));
      setExcludedSpotIds(nextOptions.excludeSpotIds ?? []);
    }
    setInterestIds(nextOptions.interests);
    setPaceId(nextOptions.pace.id);
    if (!nextOptions.campusId || nextOptions.campusId === 'bfu') setStartId(nextOptions.startId);
    const closest = DURATIONS.reduce((best, item) =>
      Math.abs(item.minutes - nextOptions.minutes) < Math.abs(best.minutes - nextOptions.minutes)
        ? item
        : best,
    );
    setDurationId(closest.id);
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

  const applyRouteEdits = (nextIncludedIds: string[], nextExcludedIds: string[]) => {
    const nextOptions = {
      ...activeOptions,
      includeSpotIds: nextIncludedIds,
      excludeSpotIds: nextExcludedIds,
    };
    skipDirty.current = true;
    if (!nextOptions.campusId || nextOptions.campusId === 'bfu') {
      setIncludedSpotIds(nextIncludedIds);
      setExcludedSpotIds(nextExcludedIds);
    }
    setGlobalRoute({
      kind: 'campus',
      plan: buildRoute(activeSpots, nextOptions),
      options: nextOptions,
      source: globalRoute.source,
      updatedAt: new Date().toISOString(),
    });
    setDirty(false);
  };

  const applyBeijingRouteEdits = (includePlaceIds: string[], excludePlaceIds: string[]) => {
    if (globalRoute.kind !== 'beijing' || !includePlaceIds.length) return;
    const nextOptions: BeijingRouteOptions = {
      ...globalRoute.options,
      startPlaceId: includePlaceIds[0],
      includePlaceIds,
      excludePlaceIds,
    };
    const estimatedPlan = buildBeijingRoute(nextOptions);
    const source = globalRoute.source;
    setGlobalRoute({
      kind: 'beijing',
      plan: estimatedPlan,
      options: nextOptions,
      source,
      updatedAt: new Date().toISOString(),
    });
    void refineBeijingRouteWithAmap(estimatedPlan, nextOptions).then((refinedPlan) => {
      setGlobalRoute({
        kind: 'beijing',
        plan: refinedPlan,
        options: nextOptions,
        source,
        updatedAt: new Date().toISOString(),
      });
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
    ? spotAcrossCampuses(activeSpotId) ?? SPOT_MAP[activeSpotId] ?? activeSpots.find((spot) => spot.id === activeSpotId) ?? null
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
              告诉 Agent 想去的行政区、景点、时长与兴趣，它会生成可保存、可增删、可在地图查看的北京路线。
            </p>
            <div className="hero-agent-entry">
              <button type="button" className="hero-agent-btn" onClick={() => setAgentOpen(true)}>
                <span aria-hidden="true">🤖</span>
                让 Agent 帮我规划
              </button>
              <span>例如：我有一天，想逛故宫、天坛和什刹海</span>
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
          route={globalRoute}
          onOpen={() => setTab('planner')}
          onRemoveStop={removePlanStop}
          onAddOptionalStop={addOptionalStop}
        />

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
                plan={globalRoute.plan}
                options={globalRoute.options}
                onOpenMap={openPlanMap}
                onEditRoute={applyBeijingRouteEdits}
              />
            ) : (
              <div className="planner-layout">
                <Planner
                  interestIds={interestIds}
                  onToggleInterest={(id) => setInterestIds((prev) => toggleInList(prev, id))}
                  durationId={durationId}
                  onDuration={setDurationId}
                  paceId={paceId}
                  onPace={setPaceId}
                  startId={startId}
                  onStart={setStartId}
                  onGenerate={generate}
                  dirty={dirty}
                />
                <RouteResult
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
            <SpotsGallery
              spots={activeSpots}
              scopeLabel={activeCampus?.shortName ?? activeOptions.campusLabel ?? '当前路线'}
              favorites={favorites}
              plannedSpotIds={plan.stops.map((stop) => stop.spot.id)}
              onToggleFavorite={(id) => setFavorites((prev) => toggleInList(prev, id))}
              onTogglePlanSpot={togglePlanSpot}
              onSelect={setActiveSpotId}
            />
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
          canUseAsStart={GATE_IDS.includes(activeSpot.id)}
        />
      ) : null}
    </div>
  );
}
