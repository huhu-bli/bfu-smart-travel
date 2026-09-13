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
import { TRIPS } from './data/trips';
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

  const options = useMemo(() => {
    const duration = DURATIONS.find((item) => item.id === durationId) ?? DURATIONS[1];
    const pace = PACES.find((item) => item.id === paceId) ?? PACES[1];
    return { interests: interestIds, minutes: duration.minutes, pace, startId };
  }, [interestIds, durationId, paceId, startId]);

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
              只需要回答四个问题。
            </h1>
            <p>
              选兴趣、给时长、定步速、挑一个门进去，系统自动排出一条顺路的校园路线。点位讲解、示意图地图、周边一日游和出行清单，都在同一个页面里。
            </p>
            <div className="hero-stats">
              <div>
                <strong>{SPOTS.length}</strong>
                <span>校园点位</span>
              </div>
              <div>
                <strong>{TRIPS.length}</strong>
                <span>周边线路</span>
              </div>
              <div>
                <strong>0</strong>
                <span>需要登录</span>
              </div>
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
              <RouteResult plan={plan} onSelectSpot={setActiveSpotId} onOpenMap={() => setTab('map')} />
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
