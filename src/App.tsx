import { useEffect, useMemo, useRef, useState } from 'react';
import AgentPanel from './components/AgentPanel';
import CampusMap from './components/CampusMap';
import Checklist from './components/Checklist';
import Footer from './components/Footer';
import Header, { type TabId } from './components/Header';
import Planner from './components/Planner';
import RouteResult from './components/RouteResult';
import SpotDetail from './components/SpotDetail';
import SpotsGallery from './components/SpotsGallery';
import Trips from './components/Trips';
import { DURATIONS, GATE_IDS, PACES } from './data/interests';
import { SPOTS, SPOT_MAP } from './data/spots';
import { buildRoute, formatDuration } from './lib/planner';
import { toggleInList, useLocalStorage } from './lib/storage';
import type { InterestId, PaceId, PlanOptions, RoutePlan } from './types';

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
  const [includedSpotIds, setIncludedSpotIds] = useState<string[]>([]);
  const [excludedSpotIds, setExcludedSpotIds] = useState<string[]>([]);

  const options = useMemo(() => {
    const duration = DURATIONS.find((item) => item.id === durationId) ?? DURATIONS[1];
    const pace = PACES.find((item) => item.id === paceId) ?? PACES[1];
    return {
      interests: interestIds,
      minutes: duration.minutes,
      pace,
      startId,
      includeSpotIds: includedSpotIds,
      excludeSpotIds: excludedSpotIds,
    };
  }, [interestIds, durationId, paceId, startId, includedSpotIds, excludedSpotIds]);

  const [plan, setPlan] = useState<RoutePlan>(() => buildRoute(SPOTS, options));
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
    setPlan(buildRoute(SPOTS, options));
    setDirty(false);
    window.setTimeout(() => {
      document.getElementById('route-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const selectStart = (id: string) => {
    setStartId(id);
    setTab('planner');
  };

  /** 由 AI 助手生成的路线：同步回规划器控件，避免出现“参数不一致”的割裂感。 */
  const applyPlanFromAgent = (nextPlan: RoutePlan, nextOptions: PlanOptions) => {
    skipDirty.current = true;
    setPlan(nextPlan);
    setDirty(false);
    setIncludedSpotIds([]);
    setExcludedSpotIds([]);
    setInterestIds(nextOptions.interests);
    setPaceId(nextOptions.pace.id);
    setStartId(nextOptions.startId);
    const closest = DURATIONS.reduce((best, item) =>
      Math.abs(item.minutes - nextOptions.minutes) < Math.abs(best.minutes - nextOptions.minutes)
        ? item
        : best,
    );
    setDurationId(closest.id);
    setTab('planner');
    window.setTimeout(() => {
      document.getElementById('route-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const applyRouteEdits = (nextIncludedIds: string[], nextExcludedIds: string[]) => {
    const nextOptions = {
      ...options,
      includeSpotIds: nextIncludedIds,
      excludeSpotIds: nextExcludedIds,
    };
    skipDirty.current = true;
    setIncludedSpotIds(nextIncludedIds);
    setExcludedSpotIds(nextExcludedIds);
    setPlan(buildRoute(SPOTS, nextOptions));
    setDirty(false);
  };

  const activeSpot = activeSpotId ? SPOT_MAP[activeSpotId] : null;

  return (
    <div className="app">
      <Header tab={tab} onChange={setTab} repoUrl={REPO_URL} />

      <main className="app-main">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="hero-pill">北京林业大学 · 校园智能导览</span>
            <h1>
              把北林逛明白，
              <br />
              直接告诉我，想怎么逛。
            </h1>
            <p>
              说出你的兴趣、时间和出发位置，Agent 会帮你规划路线、讲解点位，也能继续修改当前行程。
            </p>
            <div className="hero-agent-entry">
              <button type="button" className="hero-agent-btn" onClick={() => setAgentOpen(true)}>
                <span aria-hidden="true">🤖</span>
                让 Agent 帮我规划
              </button>
              <span>例如：我只有 1 小时，从东门进，想拍照和看植物</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <svg viewBox="0 0 320 260">
              <circle cx="252" cy="62" r="46" fill="#f4d06f" opacity="0.9" />
              <path d="M0 236 C 60 210, 120 226, 180 200 C 240 174, 290 190, 320 176 L 320 260 L 0 260 Z" fill="#0f3f2a" opacity="0.35" />
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
                availableSpots={SPOTS}
                onSelectSpot={setActiveSpotId}
                onOpenMap={() => setTab('map')}
                onEditRoute={applyRouteEdits}
              />
            </div>
          ) : null}

          {tab === 'map' ? (
            <div className="map-layout">
              <CampusMap spots={SPOTS} plan={plan} activeId={activeSpotId} onSelect={setActiveSpotId} />
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
          ) : null}

          {tab === 'spots' ? (
            <SpotsGallery
              spots={SPOTS}
              favorites={favorites}
              onToggleFavorite={(id) => setFavorites((prev) => toggleInList(prev, id))}
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
        currentPlanOptions={options}
        onSelectSpot={setActiveSpotId}
        onApplyPlan={applyPlanFromAgent}
        onOpenMap={() => setTab('map')}
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
