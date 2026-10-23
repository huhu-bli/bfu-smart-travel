import { useEffect, useMemo, useState } from 'react';
import { BEIJING_CATEGORY_LABELS, BEIJING_DISTRICTS } from '../data/beijingPlaces';
import type { CatalogCityPlace } from '../lib/placeRepository';
import type { BeijingDistrictId } from '../types';
import { useCityPlaces } from '../lib/useCityPlaces';
import { beijingRouteToText, ROUTE_AVAILABILITY_NOTICE } from '../lib/beijingPlanner';
import VisitInfo from './VisitInfo';
import TripBudgetPanel from './TripBudgetPanel';
import type { TripSpending } from '../types';
import { formatClock, formatDuration } from '../lib/planner';
import type { BeijingRouteOptions, BeijingRoutePlan } from '../types';

interface Props {
  busy?: boolean;
  onChangeSpending?: (spending: TripSpending) => void;
  plan: BeijingRoutePlan;
  options: BeijingRouteOptions;
  onOpenMap: () => void;
  onEditRoute: (includePlaceIds: string[], excludePlaceIds: string[]) => void;
}

export default function BeijingRouteResult({ plan: savedPlan, options, onOpenMap, onEditRoute, onChangeSpending, busy = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const primaryIds = useMemo(
    () => [savedPlan.origin.id, ...savedPlan.stops.map((stop) => stop.place.id)],
    [savedPlan],
  );
  // 老路线快照也从数据库读取最新门票资料；只更新票务字段，不改变交通和站点。
  const tickets = useCityPlaces({ ids: primaryIds, limit: 100 });
  const plan = useMemo(() => {
    const byId = new Map(tickets.places.map((place) => [place.id, place]));
    const update = (place: BeijingRoutePlan['origin']) => {
      const fresh = byId.get(place.id);
      return fresh ? { ...place, ticketPrice: fresh.ticketPrice, ticketNote: fresh.ticketNote } : place;
    };
    return { ...savedPlan, origin: update(savedPlan.origin), stops: savedPlan.stops.map((stop) => ({ ...stop, place: update(stop.place) })) };
  }, [savedPlan, tickets.places]);
  const [selectedIds, setSelectedIds] = useState(primaryIds);
  const [selectedPlaces, setSelectedPlaces] = useState<CatalogCityPlace[]>([]);
  const [keyword, setKeyword] = useState('');
  const [district, setDistrict] = useState('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!editing) { setSelectedIds(primaryIds); setSelectedPlaces([]); }
  }, [editing, primaryIds]);
  useEffect(() => { setEditing(false); }, [primaryIds]);

  const { places: catalogPlaces, error: catalogError, total, loading, reload } = useCityPlaces({
    keyword, districtIds: district ? [district as BeijingDistrictId] : [], limit: 12, offset,
  });
  const candidates = Array.from(new Map([plan.origin, ...plan.stops.map((stop) => stop.place), ...selectedPlaces, ...catalogPlaces].map((place) => [place.id, place])).values());

  const apply = () => {
    const selected = Array.from(new Set(selectedIds));
    if (!selected.length) return;
    const excluded = Array.from(new Set([
      ...(options.excludePlaceIds ?? []),
      ...primaryIds.filter((id) => !selected.includes(id)),
    ])).filter((id) => !selected.includes(id));
    onEditRoute(selected, excluded);
    setEditing(false);
  };

  const remove = (id: string) => {
    const next = primaryIds.filter((item) => item !== id);
    const excluded = Array.from(new Set([...(options.excludePlaceIds ?? []), id]));
    onEditRoute(next, excluded);
  };

  const addOptional = (id: string) => {
    onEditRoute([...primaryIds, id], (options.excludePlaceIds ?? []).filter((item) => item !== id));
  };

  const copy = async () => {
    const text = beijingRouteToText(plan, options.spending);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('复制下面的路线文本：', text);
    }
  };

  return (
    <section className="route-card beijing-route-card" id="route-result" aria-busy={busy}>
      <div className="route-head">
        <div>
          <span className="route-tag">北京城市路线 · {plan.routeProvider === 'amap' ? '高德实时' : plan.routeProvider === 'hybrid' ? '高德混合' : '本地估算'}</span>
          <h2>{plan.title}</h2>
          <p className="route-sub">{plan.subtitle}</p>
        </div>
        <div className="route-actions">
          <button type="button" className={editing ? 'ghost-btn is-active' : 'ghost-btn'} onClick={() => setEditing((value) => !value)}>
            {editing ? '收起编辑' : '编辑路线'}
          </button>
          <button type="button" className="ghost-btn" onClick={copy}>{copied ? '已复制 ✓' : '复制路线'}</button>
          <button type="button" className="ghost-btn" onClick={onOpenMap}>地图中查看</button>
        </div>
      </div>

      <p className="route-note">{ROUTE_AVAILABILITY_NOTICE}</p>
      {editing ? (
        <div className="route-editor">
          {catalogError ? <p role="alert">{catalogError}</p> : null}
          <div className="route-editor-head">
            <div><strong>自由增删北京目的地</strong><p>将按所选顺序重新计算交通时间；超出预算时保留站点并提示时长。</p></div>
            <span>{selectedIds.length} 个目的地</span>
          </div>
          <div className="catalog-filters">
            <label>添加目的地的地区<select value={district} disabled={busy} onChange={(event) => { setDistrict(event.target.value); setOffset(0); }}>
              <option value="">北京全部地区</option>
              {BEIJING_DISTRICTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <label>搜索目的地<input value={keyword} maxLength={100} disabled={busy} placeholder="例如：故宫、牛街、颐和园" onChange={(event) => { setKeyword(event.target.value); setOffset(0); }} /></label>
          </div>
          <p role="status" aria-live="polite">{loading ? '正在查询目的地…' : catalogError ? '查询失败，已选目的地仍保留。' : `数据库匹配 ${total} 个地点；已选项会保留在列表中。`}</p>
          {catalogError ? <button type="button" className="ghost-btn" onClick={reload}>重试目的地查询</button> : null}
          <div className="route-editor-grid">
            {candidates.map((place) => {
              const checked = selectedIds.includes(place.id);
              return (
                <label key={place.id} className={checked ? 'route-editor-option is-selected' : 'route-editor-option'}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={checked}
                    onChange={() => {
                      setSelectedIds((current) => current.includes(place.id) ? current.filter((id) => id !== place.id) : [...current, place.id]);
                      setSelectedPlaces((current) => checked ? current.filter((item) => item.id !== place.id) : [...current.filter((item) => item.id !== place.id), place]);
                    }}
                  />
                  <span><strong>{place.emoji} {place.name}</strong><small>{place.district} · {BEIJING_CATEGORY_LABELS[place.category]}</small></span>
                </label>
              );
            })}
          </div>
          <div className="catalog-pagination">
            <button type="button" aria-label="上一页目的地" disabled={busy || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))}>上一页</button>
            <span>第 {Math.floor(offset / 12) + 1} 页</span>
            <button type="button" aria-label="下一页目的地" disabled={busy || loading || offset + 12 >= total} onClick={() => setOffset(offset + 12)}>下一页</button>
          </div>
          <div className="route-editor-foot">
            <span>跨区站点会增加换乘时间；请至少保留一个目的地。</span>
            <div><button type="button" className="ghost-btn" onClick={() => setEditing(false)}>取消</button><button type="button" className="primary-btn primary-btn--sm" onClick={apply} disabled={busy || !selectedIds.length}>应用修改</button></div>
          </div>
        </div>
      ) : null}

      <div className="route-stats">
        <div className="stat"><span className="stat-label">预计总时长</span><strong>{formatDuration(plan.totalMinutes)}</strong></div>
        <div className="stat"><span className="stat-label">点位间距离</span><strong>约 {plan.totalDistanceKm} 公里</strong></div>
        <div className="stat"><span className="stat-label">必游目的地</span><strong>{primaryIds.length} 个</strong></div>
      </div>

      {tickets.loading ? <p className="route-note" role="status">正在更新数据库门票资料…</p> : null}
      {tickets.error ? <p className="route-note">门票资料更新失败，当前沿用路线快照；请查看官方票务说明。</p> : null}
      <TripBudgetPanel plan={plan} spending={options.spending} busy={busy} onChange={onChangeSpending} />

      <div className="route-body">
        <div className="route-timeline">
          <div className="route-section-head"><div><span className="route-section-kicker">PRIMARY ROUTE</span><strong>必游站点</strong></div><span>{primaryIds.length} 个目的地</span></div>
          <ol className="stop-list">
            <li className="stop-item stop-item--origin">
              <span className="stop-index">1</span>
              <div className="stop-main"><div className="stop-title"><strong>{plan.origin.emoji} {plan.origin.name}</strong><span className="stop-time">{formatClock(0, options.startHour ?? 9)} 示例出发</span></div><p className="stop-reason">{plan.origin.district} · {plan.origin.short}</p><VisitInfo place={plan.origin} /></div>
              <button type="button" className="route-stop-remove" onClick={() => remove(plan.origin.id)} aria-label={`删除${plan.origin.name}`} disabled={busy || primaryIds.length === 1}>×</button>
            </li>
            {plan.stops.map((stop, index) => (
              <li key={stop.place.id} className="stop-item">
                <span className="stop-index">{index + 2}</span>
                <div className="stop-main">
                  <div className="stop-title"><strong>{stop.place.emoji} {stop.place.name}</strong><span className="stop-time">{formatClock(stop.arrive, options.startHour ?? 9)}–{formatClock(stop.leave, options.startHour ?? 9)}</span></div>
                  <p className="stop-reason">{stop.reason}</p>
                  <div className="stop-meta"><span>{stop.travelMode} {stop.travelMinutes} 分钟 · 约 {stop.distanceKm} 公里</span><span>{stop.routeProvider === 'amap' ? '高德路线' : '本地估算'}</span><span>停留 {Math.round(stop.leave - stop.arrive)} 分钟</span><span>{stop.place.district}</span></div>
                  <VisitInfo place={stop.place} />
                </div>
                <button type="button" className="route-stop-remove" onClick={() => remove(stop.place.id)} aria-label={`删除${stop.place.name}`} disabled={busy || primaryIds.length === 1}>×</button>
              </li>
            ))}
          </ol>

          <section className="route-section route-section--optional">
            <div className="route-section-head"><div><span className="route-section-kicker">OPTIONAL</span><strong>可选站点</strong></div><span>{plan.optionalStops.length} 个备选</span></div>
            {plan.optionalStops.length ? <ul className="optional-list">{plan.optionalStops.map((stop) => <li key={stop.place.id}><div className="optional-row"><span><strong>{stop.place.emoji} {stop.place.name}</strong><small>{stop.place.district} · {stop.travelMode}约 {stop.travelMinutes} 分钟</small></span><button type="button" className="optional-add-btn" disabled={busy} onClick={() => addOptional(stop.place.id)}>加入主线</button></div></li>)}</ul> : <p className="route-section-empty">当前条件下没有更多合适的邻近站点。</p>}
          </section>

          <section className="route-section route-section--advice">
            <div className="route-section-head"><div><span className="route-section-kicker">FLEX TIME</span><strong>剩余时间建议</strong></div><span>{plan.totalMinutes > options.minutes ? `超出 ${Math.round(plan.totalMinutes - options.minutes)} 分钟` : `约 ${plan.remainingMinutes} 分钟`}</span></div>
            <p>{plan.remainingAdvice}</p>
          </section>
        </div>

        <div className="route-map route-map--summary">
          <div className="route-map-summary"><span>北京全局路线</span><strong>{plan.origin.district}出发</strong><div>{[plan.origin, ...plan.stops.map((stop) => stop.place)].map((place, index) => <span key={place.id}><b>{index + 1}</b>{place.emoji} {place.name}</span>)}</div><button type="button" className="ghost-btn" onClick={onOpenMap}>打开北京综合地图</button></div>
        </div>
      </div>
      <p className="route-note">{plan.routeNotice ?? '交通时间为本地估算；生成新路线后将自动尝试高德实时路线。'}</p>
    </section>
  );
}

