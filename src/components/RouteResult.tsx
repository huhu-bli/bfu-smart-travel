import { useState } from 'react';
import { formatClock, formatDuration, routeToText } from '../lib/planner';
import type { RoutePlan } from '../types';
import CampusMap from './CampusMap';

interface Props {
  plan: RoutePlan;
  onSelectSpot: (id: string) => void;
  onOpenMap: () => void;
}

export default function RouteResult({ plan, onSelectSpot, onOpenMap }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = routeToText(plan, plan.origin.name);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('复制下面的路线文本：', text);
    }
  };

  return (
    <section className="route-card" id="route-result">
      <div className="route-head">
        <div>
          <span className="route-tag">智能生成</span>
          <h2>{plan.title}</h2>
          <p className="route-sub">{plan.subtitle}</p>
        </div>
        <div className="route-actions">
          <button type="button" className="ghost-btn" onClick={handleCopy}>
            {copied ? '已复制 ✓' : '复制路线'}
          </button>
          <button type="button" className="ghost-btn" onClick={onOpenMap}>
            地图中查看
          </button>
        </div>
      </div>

      <div className="route-stats">
        <div className="stat">
          <span className="stat-label">预计总时长</span>
          <strong>{formatDuration(plan.totalMinutes)}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">步行距离</span>
          <strong>约 {plan.totalMeters} 米</strong>
        </div>
        <div className="stat">
          <span className="stat-label">游览站点</span>
          <strong>{plan.stops.length} 个</strong>
        </div>
      </div>

      <div className="route-body">
        <ol className="stop-list">
          <li className="stop-item stop-item--origin">
            <span className="stop-index">起</span>
            <div className="stop-main">
              <div className="stop-title">
                <strong>{plan.origin.name}</strong>
                <span className="stop-time">{formatClock(0)} 出发</span>
              </div>
              <p className="stop-reason">{plan.origin.short}</p>
            </div>
          </li>
          {plan.stops.map((stop, index) => (
            <li key={stop.spot.id} className="stop-item">
              <span className="stop-index">{index + 1}</span>
              <div className="stop-main">
                <button type="button" className="stop-title stop-title--button" onClick={() => onSelectSpot(stop.spot.id)}>
                  <strong>
                    <span className="stop-emoji">{stop.spot.emoji}</span>
                    {stop.spot.name}
                  </strong>
                  <span className="stop-time">
                    {formatClock(stop.arrive)} - {formatClock(stop.leave)}
                  </span>
                </button>
                <details className="stop-details">
                  <summary>查看停留建议</summary>
                  <p className="stop-reason">{stop.reason}</p>
                  <div className="stop-meta">
                    <span>步行 {stop.walkMinutes} 分钟 · {stop.walkMeters} 米</span>
                    <span>停留 {Math.round(stop.leave - stop.arrive)} 分钟</span>
                    <span>最佳时段 {stop.spot.bestTime}</span>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ol>

        <div className="route-map">
          <CampusMap spots={plan.stops.map((stop) => stop.spot).concat(plan.origin)} plan={plan} activeId={null} onSelect={onSelectSpot} compact />
          <div className="route-map-tips">
            {plan.stops
              .flatMap((stop) => stop.spot.highlights.slice(0, 1))
              .slice(0, 4)
              .map((highlight) => (
                <span key={highlight} className="tip-pill">
                  {highlight}
                </span>
              ))}
          </div>
        </div>
      </div>

      <p className="route-note">
        路线按“兴趣匹配 + 顺路程度”自动排序，时间包含步行与停留估算。实际请按现场开放情况灵活调整。
      </p>
    </section>
  );
}
