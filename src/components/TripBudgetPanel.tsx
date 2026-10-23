import type { BeijingRoutePlan, TripSpending } from '../types';
import { BUDGET_NOTICE, cleanSpending, isMoney, money, moneyRange, readTicketPrice, routeBudget } from '../lib/tripBudget';

export default function TripBudgetPanel({ plan, spending, busy, onChange }: {
  plan: BeijingRoutePlan; spending?: TripSpending; busy?: boolean; onChange?: (value: TripSpending) => void;
}) {
  const value = cleanSpending(spending);
  const b = routeBudget(plan, value);
  const update = (raw: string, key?: 'limitCny' | 'foodCny' | 'transportCny' | 'otherCny', id?: string) => {
    if (raw !== '' && !isMoney(Number(raw))) return;
    const next = { ...value, ticketOverrides: { ...value.ticketOverrides } };
    if (id) { if (raw === '') delete next.ticketOverrides[id]; else next.ticketOverrides[id] = Number(raw); }
    else if (key) { if (raw === '') delete next[key]; else next[key] = Number(raw); }
    onChange?.(next);
  };
  return <section className="trip-budget" aria-label="门票与金额预算">
    <div className="trip-budget-head"><div><h3>门票与金额预算</h3><p>人民币 / 人 · 仅统计必游主线</p></div><strong>{moneyRange(b.min, b.max)}<small>已知费用小计 / 人</small></strong></div>
    <div className="trip-budget-inputs">
      {([['limitCny', '每人预算上限'], ['foodCny', '餐饮估算'], ['transportCny', '交通估算'], ['otherCny', '其他费用估算']] as const).map(([key, label]) => <label key={key}>{label}（元）<input type="number" inputMode="decimal" min="0" max="100000" step="0.01" disabled={busy || !onChange} value={value[key] ?? ''} placeholder={key === 'limitCny' ? '可选' : '未填，待估算'} onChange={(e) => update(e.target.value, key)} /></label>)}
    </div>
    <details className="trip-budget-tickets" open>
      <summary>逐站门票 · 已知合计 {moneyRange(b.ticketMin, b.ticketMax)}/人</summary>
      {b.tickets.map((ticket) => {
        const place = [plan.origin, ...plan.stops.map((s) => s.place)].find((p) => p.id === ticket.id)!;
        const quote = readTicketPrice(place);
        return <div className="trip-budget-ticket" key={ticket.id}><div><strong>{ticket.name}</strong><p>{ticket.min === undefined ? '票价待核实' : `${moneyRange(ticket.min, ticket.max!)}/人`} · {ticket.basis}</p>{ticket.manual && quote ? <small>数据库基础票：{moneyRange(quote.min, quote.max)} · {quote.basis}</small> : null}</div><label>{ticket.name}手动票价（元/人）<input type="number" inputMode="decimal" min="0" max="100000" step="0.01" disabled={busy || !onChange} value={value.ticketOverrides?.[ticket.id] ?? ''} placeholder="留空沿用资料" onChange={(e) => update(e.target.value, undefined, ticket.id)} /></label></div>;
      })}
    </details>
    <p className="trip-budget-status" role="status">{b.status}{b.limit !== undefined ? `（上限 ${money(b.limit)}/人）` : ''}</p>
    {b.unknownTickets.length ? <p>门票待确认：{b.unknownTickets.join('、')}。</p> : null}
    {b.missingFees.length ? <p>尚未填写：{b.missingFees.join('、')}。</p> : null}
    <p className="route-note">{BUDGET_NOTICE}</p>
  </section>;
}
