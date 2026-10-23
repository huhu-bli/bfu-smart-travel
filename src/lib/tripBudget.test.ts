import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { BEIJING_PLACES } from '../data/beijingPlaces';
import { PACES } from '../data/interests';
import { buildBeijingRoute, beijingRouteToText } from './beijingPlanner';
import { cleanSpending, readTicketPrice, routeBudget, spendingFromText, spendingFromTool, ticketLabel } from './tripBudget';
import { decodeStoredGlobalRoute } from './storedState';
import TripBudgetPanel from '../components/TripBudgetPanel';
import type { BeijingRouteOptions } from '../types';
const paid = { ...BEIJING_PLACES[0], ticketPrice: { currency: 'CNY', min: 40, max: 60, basis: '基础成人票，特展另计' } };
const free = { ...BEIJING_PLACES[1], ticketPrice: { currency: 'CNY', min: 0, max: 0, basis: '基本陈列免费，需预约' } };
const unknown = { ...BEIJING_PLACES[2], ticketPrice: null };
const options: BeijingRouteOptions = { scope: 'beijing', interests: [], minutes: 720, pace: PACES[1], travelMode: 'mixed', districtIds: [], startPlaceId: paid.id, includePlaceIds: [paid.id, free.id, unknown.id], preserveSelectedStops: true };
const plan = buildBeijingRoute(options, [paid, free, unknown]);

test('ticket totals include origin once, retain seasonal ranges and zero, and exclude optional candidates', () => {
  const expensive = { ...unknown, id: 'expensive', ticketPrice: { currency: 'CNY', min: 999, max: 999, basis: 'extra' } };
  const b = routeBudget({ ...plan, stops: [...plan.stops, { ...plan.stops[0], place: paid }], optionalStops: [{ ...plan.stops[0], place: expensive }] });
  assert.equal(b.tickets.length, 3);
  assert.deepEqual([b.ticketMin, b.ticketMax], [40, 60]);
  assert.deepEqual(b.unknownTickets, [unknown.name]);
  assert.match(ticketLabel(free), /免费/);
  assert.match(ticketLabel(unknown), /待核实/);
});

test('unknown costs block a fits-budget claim; known lower and upper bounds warn correctly', () => {
  assert.match(routeBudget(plan, { limitCny: 1000 }).status, /暂不能确认/);
  assert.match(routeBudget(plan, { limitCny: 30 }).status, /至少超出 ¥10/);
  assert.match(routeBudget(plan, { limitCny: 50 }).status, /可能超出 ¥10/);
  const spending = { limitCny: 80.3, foodCny: 0.1, transportCny: 0.2, otherCny: 0, ticketOverrides: { [unknown.id]: 20 } };
  const b = routeBudget(plan, spending);
  assert.deepEqual([b.min, b.max], [60.3, 80.3]);
  assert.equal(b.incomplete, false);
  assert.match(b.status, /预算内.*余 ¥0/);
  assert.equal(routeBudget(plan, { ...spending, ticketOverrides: { [paid.id]: 0, [unknown.id]: 0 } }).ticketMax, 0);
});

test('malformed cached prices and costs cannot become free quotes or break rendering', () => {
  for (const ticketPrice of [{ min: 0, max: 0 }, { currency: 'CNY', min: -1, max: 2, basis: 'x' }, { currency: 'CNY', min: 5, max: 2, basis: 'x' }, { currency: 'CNY', min: '0', max: 0, basis: {} }, { currency: 'CNY', min: 0, max: Infinity, basis: 'x' }]) {
    assert.equal(readTicketPrice({ ...paid, ticketPrice }), undefined);
  }
  assert.deepEqual(cleanSpending({ limitCny: null, foodCny: -1, transportCny: '0', otherCny: 0.001, ticketOverrides: { x: NaN } }), {});
  const snapshot = { kind: 'beijing', plan, options: { ...options, spending: { limitCny: 0, foodCny: 'bad', ticketOverrides: { [paid.id]: 20.5 } } }, source: 'manual', updatedAt: '2026-10-23T00:00:00Z' };
  const restored = decodeStoredGlobalRoute(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(restored?.kind, 'beijing');
  if (restored?.kind === 'beijing') assert.deepEqual(restored.options.spending, { limitCny: 0, ticketOverrides: { [paid.id]: 20.5 } });
});

test('copy and visible panel include per-person costs, unknowns, manual estimates and missing fees', () => {
  const spending = { limitCny: 120, ticketOverrides: { [unknown.id]: 12.5 } };
  const text = beijingRouteToText(plan, spending);
  assert.match(text, /¥52.5–¥72.5/);
  assert.match(text, /手动估算/);
  assert.match(text, /餐饮：未填/);
  assert.match(text, /不代表有票/);
  const html = renderToString(createElement(TripBudgetPanel, { plan, spending, onChange: () => {} }));
  assert.match(html, /人民币 \/ 人/);
  assert.match(html, /每人预算上限/);
  assert.match(html, /暂不能确认/);
  assert.match(html, /手动票价/);
});

test('explicit monetary requests and tool arguments keep zero, preserve existing fees, and reject coercion', () => {
  assert.deepEqual(spendingFromText('逛故宫4小时，预算200元，餐饮预算50元，交通20元，其他0元'), { limitCny: 200, foodCny: 50, transportCny: 20, otherCny: 0 });
  assert.deepEqual(spendingFromText('交通预算30元，逛3小时'), { transportCny: 30 });
  assert.deepEqual(spendingFromText('预算0元'), { limitCny: 0 });
  assert.deepEqual(spendingFromTool({ budget_cny: null, food_cny: '', transport_cny: '0', other_cny: 0 }, { limitCny: 200, foodCny: 50 }), { limitCny: 200, foodCny: 50, otherCny: 0 });
});

test('city tool and local assistant use database ticket fields and retain budgets across route edits', async () => {
  const { fixturePlaces } = await import('../../test/support/fixturePlaces');
  const { runTool } = await import('./toolExecutor');
  const { prepareBeijingRouteEdit } = await import('./beijingRouteEditor');
  const { answerLocally } = await import('./localAgent');
  const repository = { ...fixturePlaces, city: async (...args: Parameters<typeof fixturePlaces.city>) => {
    const result = await fixturePlaces.city(...args);
    return { ...result, places: result.places.map((p) => p.id === paid.id ? { ...p, ticketPrice: { ...paid.ticketPrice, currency: 'CNY' as const } } : p) };
  } };
  const context: import('../agent/types').AgentToolContext = { target: { kind: 'city', label: '北京市', explicit: true, routeSupported: true }, placeRepository: repository, plan: null, planOptions: null, beijingPlan: null, beijingPlanOptions: null, spotIds: [], placeIds: [], tripIds: [], trace: [], requestedSpending: { limitCny: 200 } };
  const output = JSON.parse(await runTool('build_beijing_route', JSON.stringify({ minutes: 480, include_place_ids: [paid.id], start_place_id: paid.id, budget_cny: 999, food_cny: 50 }), context));
  assert.equal(context.beijingPlanOptions?.spending?.limitCny, 200);
  assert.equal(output.costEstimate.limit, 200);
  assert.equal(output.costEstimate.tickets[0].max, 60);
  const edited = await prepareBeijingRouteEdit(repository, context.beijingPlanOptions!, [paid.id], []);
  assert.deepEqual(edited.options.spending, context.beijingPlanOptions?.spending);
  const reply = await answerLocally('逛故宫4小时，预算200元，餐饮50元', undefined, repository);
  assert.equal(reply.beijingPlanOptions?.spending?.limitCny, 200);
  assert.match(reply.text, /¥40–¥60/);
  const followup = await answerLocally('改成5小时', reply.memory, repository);
  assert.equal(followup.beijingPlanOptions?.spending?.limitCny, 200);
  assert.equal(followup.beijingPlanOptions?.spending?.foodCny, 50);
});

test('budget-only conversations preserve the exact current route without planning or model requests', async () => {
  const { isSpendingOnlyRequest } = await import('./tripBudget');
  const { runAgentTurn } = await import('../agent/runtime');
  const { DEFAULT_AGENT_SETTINGS } = await import('../agent/config');
  const { BEIJING_TARGET } = await import('./travelTarget');
  for (const text of ['预算200元', '预算改成200元', '当前路线每人预算200元，餐饮50元，交通20元，其他0元。保留所有站点，只调整金额。']) assert.equal(isSpendingOnlyRequest(text), true);
  for (const text of ['去故宫预算200元', '改成4小时，预算200元', '加入天坛，预算200元', '预算200元，删掉故宫']) assert.equal(isSpendingOnlyRequest(text), false);
  for (const protocol of ['chat'] as const) {
    const result = await runAgentTurn({ history: [], userText: '当前路线预算0元', settings: { ...DEFAULT_AGENT_SETTINGS, protocol }, scene: 'outside-trip', previousTarget: BEIJING_TARGET,
      currentBeijingPlan: plan, currentBeijingPlanOptions: { ...options, spending: { foodCny: 15 } } });
    assert.equal(result.beijingPlan, plan);
    assert.deepEqual(result.beijingPlanOptions?.spending, { limitCny: 0, foodCny: 15 });
    assert.equal(result.rounds, 0);
    assert.equal(result.history.length, 2);
    assert.match(result.text, /保留当前路线/);
    assert.match(result.text, /至少超出/);
  }
});
