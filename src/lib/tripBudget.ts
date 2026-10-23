import type { BeijingPlace, BeijingRoutePlan, TicketPrice, TripSpending } from '../types';

export const MAX_CNY = 100000;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_CNY && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
export const money = (n: number) => `¥${Number(n.toFixed(2))}`;
export const moneyRange = (min: number, max: number) => min === max ? money(min) : `${money(min)}–${money(max)}`;
export function readTicketPrice(place: BeijingPlace & { ticketPrice?: unknown }): TicketPrice | undefined {
  const p = (place as BeijingPlace & { ticketPrice?: unknown }).ticketPrice;
  return object(p) && p.currency === 'CNY' && isMoney(p.min) && isMoney(p.max) && p.min <= p.max &&
    typeof p.basis === 'string' && !!p.basis.trim() && p.basis.length <= 500 ? p as unknown as TicketPrice : undefined;
}
export function ticketLabel(place: BeijingPlace): string {
  const p = readTicketPrice(place);
  return p ? `${p.max === 0 ? '免费（基础参观）' : `${moneyRange(p.min, p.max)}/人`} · ${p.basis}` : '票价待核实';
}
/** 缓存中的单个损坏金额不影响整条路线，0 元仍是明确填写的数值。 */
export function cleanSpending(value: unknown): TripSpending {
  if (!object(value)) return {};
  const result: TripSpending = {};
  for (const key of ['limitCny', 'foodCny', 'transportCny', 'otherCny'] as const) {
    if (isMoney(value[key])) result[key] = value[key];
  }
  if (object(value.ticketOverrides)) {
    const entries = Object.entries(value.ticketOverrides).filter(([id, n]) => /^[a-z0-9][a-z0-9-]{0,99}$/.test(id) && isMoney(n)).slice(0, 200);
    if (entries.length) result.ticketOverrides = Object.fromEntries(entries) as Record<string, number>;
  }
  return result;
}
export function routeBudget(plan: BeijingRoutePlan, value?: TripSpending) {
  const spending = cleanSpending(value);
  const places = [...new Map([plan.origin, ...plan.stops.map((s) => s.place)].map((p) => [p.id, p])).values()];
  const tickets = places.map((place) => {
    const manual = spending.ticketOverrides?.[place.id];
    const price = readTicketPrice(place);
    return { id: place.id, name: place.name, min: manual ?? price?.min, max: manual ?? price?.max,
      basis: manual !== undefined ? '手动估算，替代基础票价' : price?.basis ?? '票价待核实', manual: manual !== undefined };
  });
  const sum = (values: (number | undefined)[]) => values.reduce<number>((a, n) => a + Math.round((n ?? 0) * 100), 0) / 100;
  const ticketMin = sum(tickets.map((t) => t.min)), ticketMax = sum(tickets.map((t) => t.max));
  const extras = sum([spending.foodCny, spending.transportCny, spending.otherCny]);
  const min = sum([ticketMin, extras]), max = sum([ticketMax, extras]);
  const unknownTickets = tickets.filter((t) => t.min === undefined).map((t) => t.name);
  const missingFees = ([['foodCny', '餐饮'], ['transportCny', '交通'], ['otherCny', '其他']] as const)
    .filter(([key]) => spending[key] === undefined).map(([, label]) => label);
  const incomplete = !!(unknownTickets.length || missingFees.length);
  const limit = spending.limitCny;
  const status = limit === undefined ? '未设置金额上限' : min > limit ? `已知费用至少超出 ${money(sum([min, -limit]))}/人` : max > limit
    ? `已知费用可能超出 ${money(sum([max, -limit]))}/人` : incomplete ? '费用未完整，暂不能确认是否在预算内' : `当前估算在预算内，按高值余 ${money(sum([limit, -max]))}/人`;
  return { tickets, ticketMin, ticketMax, extras, min, max, limit, unknownTickets, missingFees, incomplete, status };
}
export const BUDGET_NOTICE = '按每人基础成人票估算；季节票价显示区间，联票、特展、游船等额外项目及优惠资格请核实后手动调整。未填费用不视为免费。预算用于核对费用，不自动删减站点，也不代表有票。';
export function budgetToText(plan: BeijingRoutePlan, spending?: TripSpending): string {
  const b = routeBudget(plan, spending);
  const s = cleanSpending(spending);
  return ['门票与金额预算（人民币/人，仅必游主线）',
    ...b.tickets.map((t) => `${t.name}：${t.min === undefined ? '待核实' : moneyRange(t.min, t.max!)} · ${t.basis}`),
    `已知门票合计：${moneyRange(b.ticketMin, b.ticketMax)}；餐饮：${s.foodCny === undefined ? '未填' : money(s.foodCny)}；交通：${s.transportCny === undefined ? '未填' : money(s.transportCny)}；其他：${s.otherCny === undefined ? '未填' : money(s.otherCny)}`,
    `已知费用小计：${moneyRange(b.min, b.max)}/人；金额上限：${b.limit === undefined ? '未设置' : money(b.limit)}。${b.status}。`,
    ...(b.unknownTickets.length ? [`门票待确认：${b.unknownTickets.join('、')}`] : []), BUDGET_NOTICE].join('\n');
}
/** 只提取带“预算/费用上限”和元单位的明确总额，避免把时长当成金额。 */
export function spendingFromText(text: string): TripSpending {
  const result: TripSpending = {};
  const patterns = [
    ['limitCny', /(?:总预算|金额预算|预算|费用上限)(?:为|是|改成|改为|调整为|设置为|控制在|不超过|最多|约|每人|人均|\s|：|:)*(\d+(?:\.\d{1,2})?)\s*元/],
    ['foodCny', /(?:餐饮|吃饭|餐费)(?:预算|费用)?(?:为|是|改成|改为|调整为|设置为|约|\s|：|:)*(\d+(?:\.\d{1,2})?)\s*元/],
    ['transportCny', /(?:交通|车费)(?:预算|费用)?(?:为|是|改成|改为|调整为|设置为|约|\s|：|:)*(\d+(?:\.\d{1,2})?)\s*元/],
    ['otherCny', /其他(?:预算|费用)?(?:为|是|改成|改为|调整为|设置为|约|\s|：|:)*(\d+(?:\.\d{1,2})?)\s*元/],
  ] as const;
  for (const [key, pattern] of patterns) {
    const match = (key === 'limitCny' ? text.replace(/(?:餐饮|吃饭|餐费|交通|车费|门票|其他)预算/g, '分项费用') : text).match(pattern);
    if (match && isMoney(Number(match[1]))) result[key] = Number(match[1]);
  }
  return result;
}
export function spendingFromTool(args: Record<string, unknown>, previous?: TripSpending): TripSpending {
  const result = cleanSpending(previous);
  for (const [arg, key] of [['budget_cny', 'limitCny'], ['food_cny', 'foodCny'], ['transport_cny', 'transportCny'], ['other_cny', 'otherCny']] as const) {
    if (isMoney(args[arg])) result[key] = args[arg];
  }
  return result;
}

/** 只由金额和保留路线措辞组成时，直接修改预算，避免工具或兜底算法重新选点。 */
export function isSpendingOnlyRequest(text: string): boolean {
  if (!Object.keys(spendingFromText(text)).length) return false;
  const remainder = text
    .replace(/(?:总预算|金额预算|预算|费用上限|餐饮(?:预算|费用)?|吃饭(?:预算|费用)?|餐费|交通(?:预算|费用)?|车费|其他(?:预算|费用)?)(?:为|是|改成|改为|调整为|设置为|控制在|不超过|最多|约|每人|人均|\s|：|:)*(?:\d+(?:\.\d{1,2})?)\s*元/g, '')
    .replace(/(?:当前路线|这条路线|刚才那条路线|保留所有站点|保留全部站点|保留站点|只调整金额|只修改预算|只改预算|只调整预算|每人|人均|把|将|的)/g, '')
    .replace(/[\s，,。.;；!！:：]/g, '');
  return remainder === '';
}
