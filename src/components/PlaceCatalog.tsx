import { ticketLabel } from '../lib/tripBudget';
import { useEffect, useState } from 'react';
import { BEIJING_CATEGORY_LABELS, BEIJING_DISTRICTS } from '../data/beijingPlaces';
import { CAMPUSES } from '../data/campuses';
import { INTERESTS } from '../data/interests';
import { databasePlaces, type CatalogCityPlace, type CatalogSpot } from '../lib/placeRepository';

export default function PlaceCatalog({ onPlanCity, planBusy = false }: { onPlanCity: (place: CatalogCityPlace) => Promise<void>; planBusy?: boolean }) {
  const [scope, setScope] = useState('city');
  const [district, setDistrict] = useState('');
  const [interest, setInterest] = useState('');
  const [keyword, setKeyword] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [places, setPlaces] = useState<Array<CatalogCityPlace | CatalogSpot>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [planningId, setPlanningId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setBusy(true); setError(''); setPlaces([]);
    const timer = window.setTimeout(() => {
      const filters = { keyword, districtIds: district ? [district] : [], interests: interest ? [interest] : [], limit: 12, offset };
      const request = scope === 'city' ? databasePlaces.city(filters, controller.signal) : databasePlaces.campus(scope, { ...filters, districtIds: [] }, controller.signal);
      void request.then((page) => {
        if (active) { setPlaces(page.places); setTotal(page.total); }
      }).catch((reason: unknown) => {
        if (active) { setError(reason instanceof Error ? reason.message : '景点查询失败。'); setTotal(0); }
      }).finally(() => { if (active) setBusy(false); });
    }, 250);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [scope, district, interest, keyword, offset, retry]);

  return <section className="place-catalog" aria-label="景点数据库查询">
    <h2>查找景点</h2>
    <p>按地区、兴趣和关键词查询景点资料，无需向 AI 提问。</p>
    <p>开放与票务信息按来源页面标注核对日期；临时闭馆、节假日和特展安排请在出行前查看官方公告。</p>
    <div className="catalog-filters">
      <label>范围<select value={scope} onChange={(e) => { setScope(e.target.value); setOffset(0); }}>
        <option value="city">北京城市景点</option>
        {CAMPUSES.filter((campus) => campus.spots?.length).map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
      </select></label>
      {scope === 'city' ? <label>行政区<select value={district} onChange={(e) => { setDistrict(e.target.value); setOffset(0); }}>
        <option value="">全部行政区</option>{BEIJING_DISTRICTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label> : null}
      <label>兴趣<select value={interest} onChange={(e) => { setInterest(e.target.value); setOffset(0); }}>
        <option value="">全部兴趣</option>{INTERESTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>关键词<input value={keyword} placeholder="例如：银杏、故宫、胡同" onChange={(e) => { setKeyword(e.target.value); setOffset(0); }} /></label>
    </div>
    <div role="status" aria-live="polite">{busy ? '正在查询景点…' : error ? error : `数据库查询结果：${total} 个地点`}</div>
    {error ? <button type="button" onClick={() => setRetry((value) => value + 1)}>重新查询</button> : null}
    {!busy && !error && !places.length ? <p className="empty-state">没有匹配的地点，请调整关键词或筛选条件。</p> : null}
    <div className="catalog-grid">{places.map((place) => <article className="catalog-card" key={place.id}>
      <h3>{place.emoji} {place.name}</h3>
      <p>{'district' in place ? `${place.district} · ${BEIJING_CATEGORY_LABELS[place.category]}` : place.kind} · 建议停留 {place.visit} 分钟</p>
      <p>{place.description}</p>
      <p>{place.highlights.join(' · ')}</p>
      <details><summary>资料与开放信息</summary>
        <p>开放信息：{place.openingHours || '尚未核实，请以官方公告为准。'}</p>
        <p>地址：{place.address || '尚未收录'}</p>
        {'category' in place ? <p>基础门票：{ticketLabel(place)}</p> : null}
        <p>票价说明：{place.ticketNote || '尚未收录，请以官方公告为准。'}</p>
        {place.bookingUrl?.startsWith('https://') ? <p><a href={place.bookingUrl} target="_blank" rel="noopener noreferrer">查看官方票务与参观说明</a></p> : null}
        <p>{place.tips}</p>
        {place.sources?.map((source) => <p key={source.reference}>来源：{source.reference.startsWith('https://')
          ? <a href={source.reference} target="_blank" rel="noopener noreferrer">{source.kind === 'official' ? '官方页面' : '参考资料'}</a>
          : source.reference} · {source.verificationStatus === 'verified' ? `网页核对 ${source.verifiedAt}` : '待核实'}</p>)}
      </details>
      {'district' in place ? <button type="button" disabled={planBusy || planningId !== null} onClick={() => {
        setPlanningId(place.id);
        void onPlanCity(place).finally(() => setPlanningId(null));
      }}>{planningId === place.id ? '正在规划…' : '以此为起点规划路线'}</button> : null}
    </article>)}</div>
    {!error ? <div className="catalog-pagination">
      <button type="button" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))}>上一页</button>
      <span>第 {Math.floor(offset / 12) + 1} 页</span>
      <button type="button" disabled={busy || offset + 12 >= total} onClick={() => setOffset(offset + 12)}>下一页</button>
    </div> : null}
  </section>;
}
