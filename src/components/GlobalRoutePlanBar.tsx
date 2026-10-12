import { campusById } from '../data/campuses';
import { formatDuration } from '../lib/planner';
import type { GlobalRoutePlan } from '../types';

interface Props {
  route: GlobalRoutePlan;
  onOpen: () => void;
  onRemoveStop: (spotId: string) => void;
  onAddOptionalStop: (spotId: string) => void;
}

export default function GlobalRoutePlanBar({
  route,
  onOpen,
  onRemoveStop,
  onAddOptionalStop,
}: Props) {
  const { plan, options } = route;
  const campus = campusById(options.campusId);
  const campusLabel = campus?.shortName ?? options.campusLabel ?? '海淀';

  return (
    <section className="global-route-plan" aria-label="我的全局路线计划">
      <div className="global-route-plan__head">
        <div>
          <span className="global-route-plan__eyebrow">
            我的路线计划 · {route.source === 'agent' ? 'Agent 推荐' : '手动规划'}
          </span>
          <strong>{campusLabel} · {plan.title}</strong>
          <small>
            {plan.stops.length} 站 · {formatDuration(plan.totalMinutes)} · 约 {plan.totalMeters} 米
          </small>
        </div>
        <button type="button" className="primary-btn primary-btn--sm" onClick={onOpen}>
          编辑完整计划
        </button>
      </div>

      <div className="global-route-plan__stops" aria-label="计划内站点">
        {plan.stops.length ? plan.stops.map((stop, index) => (
          <span className="global-route-plan__chip" key={stop.spot.id}>
            <b>{index + 1}</b>
            {stop.spot.name}
            <button
              type="button"
              aria-label={`从路线中删除${stop.spot.name}`}
              title={`删除${stop.spot.name}`}
              onClick={() => onRemoveStop(stop.spot.id)}
            >
              ×
            </button>
          </span>
        )) : <span className="global-route-plan__empty">当前没有必游站点，可进入编辑器添加。</span>}
      </div>

      {plan.optionalStops.length ? (
        <details className="global-route-plan__optional">
          <summary>从 {plan.optionalStops.length} 个可选站点中添加</summary>
          <div>
            {plan.optionalStops.map((stop) => (
              <button
                type="button"
                key={stop.spot.id}
                onClick={() => onAddOptionalStop(stop.spot.id)}
              >
                ＋ {stop.spot.name}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
