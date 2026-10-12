import { useEffect, useMemo, useRef, useState } from 'react';
import AgentPanel from './components/AgentPanel';
import CampusMap from './components/CampusMap';
import Checklist from './components/Checklist';
import Footer from './components/Footer';
import GlobalRoutePlanBar from './components/GlobalRoutePlanBar';
import HaidianMap from './components/HaidianMap';
import Header, { type TabId } from './components/Header';
import Planner from './components/Planner';
import RouteResult from './components/RouteResult';
import SpotDetail from './components/SpotDetail';
import SpotsGallery from './components/SpotsGallery';
import Trips from './components/Trips';
import { DURATIONS, GATE_IDS, PACES } from './data/interests';
import { SPOTS, SPOT_MAP } from './data/spots';
import { campusById, spotAcrossCampuses } from './data/campuses';
import { buildRoute, formatDuration } from './lib/planner';
import { toggleInList, useLocalStorage } from './lib/storage';
import type { GlobalRoutePlan, InterestId, PaceId, PlanOptions, RoutePlan, Spot } from './types';

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
  const [mapScope, setMapScope] = useState<'campus' | 'haidian'>('campus');
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
    plan: buildRoute(SPOTS, options),
    options,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  });
  const plan = globalRoute.plan;
  const activeOptions = globalRoute.options;
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
    setMapScope(nextOptions.campusId === 'bfu' || !nextOptions.campusId ? 'campus' : 'haidian');
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
      plan: buildRoute(activeSpots, nextOptions),
      options: nextOptions,
      source: globalRoute.source,
      updatedAt: new Date().toISOString(),
    });
    setDirty(false);
  };

  const setExactPlanStops = (spotIds: string[]) => {
    const selected = Array.from(new Set(spotIds));
    const excluded = activeSpots
      .filter((spot) => spot.id !== plan.origin.id && spot.kind !== '入口' && !selected.includes(spot.id))
      .map((spot) => spot.id);
    applyRouteEdits(selected, excluded);
  };

  const removePlanStop = (spotId: string) => {
    setExactPlanStops(plan.stops.map((stop) => stop.spot.id).filter((id) => id !== spotId));
  };

  const addOptionalStop = (spotId: string) => {
    setExactPlanStops([...plan.stops.map((stop) => stop.spot.id), spotId]);
  };

  const togglePlanSpot = (spotId: string) => {
    const current = plan.stops.map((stop) => stop.spot.id);
    setExactPlanStops(current.includes(spotId) ? current.filter((id) => id !== spotId) : [...current, spotId]);
  };

  const openPlanMap = () => {
    setMapScope(activeCampus?.mapMode === 'bfu-svg' ? 'campus' : 'haidian');
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
            <span className="hero-pill">海淀城市漫游 · 高校 · 公园 · 博物馆</span>
            <h1>
              一张地图，
              <br />
              逛遍海淀。
            </h1>
            <p>
              告诉 Agent 你想去哪里、逛多久、喜欢什么，它会在高校、公园、博物馆与城市路线之间帮你组织一趟海淀旅行。
            </p>
            <div className="hero-agent-entry">
              <button type="button" className="hero-agent-btn" onClick={() => setAgentOpen(true)}>
                <span aria-hidden="true">🤖</span>
                让 Agent 帮我规划
              </button>
              <span>例如：我有 3 小时，想逛北京交通大学并拍照</span>
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

        <section className="explore-strip" aria-label="海淀探索入口">
          <div className="explore-intro">
            <span className="section-kicker">HAIDIAN DISCOVERY</span>
            <strong>从一所学校，扩展到整片海淀</strong>
            <p>高校漫游、自然公园、人文场馆，都可以从这里开始。</p>
          </div>
          <div className="explore-actions">
            <button
              type="button"
              className="explore-card"
              onClick={() => {
                setMapScope('haidian');
                setTab('map');
              }}
            >
              <span className="explore-icon" aria-hidden="true">🗺️</span>
              <span>
                <strong>海淀全域</strong>
                <small>发现高校、公园与城市目的地</small>
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
                <strong>周末路线</strong>
                <small>获取半日游与城市漫游灵感</small>
              </span>
              <span className="explore-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <div className="tab-panel" key={tab}>
          {tab === 'planner' ? (
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
          ) : null}

          {tab === 'map' ? (
            <div className="map-explorer">
              <div className="map-scope-switch" role="group" aria-label="地图范围">
                <button
                  type="button"
                  className={mapScope === 'campus' ? 'is-active' : ''}
                  onClick={() => setMapScope('campus')}
                  disabled={activeCampus?.mapMode !== 'bfu-svg'}
                  title={activeCampus?.mapMode !== 'bfu-svg' ? '当前路线没有专用校园底图' : undefined}
                >
                  校园精细地图
                </button>
                <button
                  type="button"
                  className={mapScope === 'haidian' ? 'is-active' : ''}
                  onClick={() => setMapScope('haidian')}
                >
                  海淀综合地图
                </button>
              </div>

              {mapScope === 'campus' && activeCampus?.mapMode === 'bfu-svg' ? (
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
                <HaidianMap />
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
        onSelectSpot={setActiveSpotId}
        onPlanGenerated={savePlanFromAgent}
        onApplyPlan={applyPlanFromAgent}
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
