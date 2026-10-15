import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTravelTarget } from '../lib/travelTarget';
import type { AgentToolContext } from './types';
import { ensureCityRoute } from './cityRouteGuard';

function contextFor(question: string): AgentToolContext {
  return {
    target: resolveTravelTarget(question), plan: null, planOptions: null,
    beijingPlan: null, beijingPlanOptions: null,
    spotIds: [], placeIds: [], tripIds: [], trace: [],
  };
}

test('city route guard repairs unsupported-campus-only reply with actual East/West city plan', async () => {
  const question = '今天下午在东城区、西城区看银杏，怎么安排？';
  const context = contextFor(question);
  const answer = await ensureCityRoute(question, '当前查询能力只覆盖高校点位，不能调用城市景点路线工具。', context);
  assert.ok(context.beijingPlan);
  assert.ok(context.beijingPlanOptions);
  assert.equal(context.beijingPlanOptions?.startHour, 14);
  assert.deepEqual(context.beijingPlanOptions?.districtIds, ['dongcheng', 'xicheng']);
  assert.match(answer, /地坛公园/);
  assert.match(answer, /月坛公园/);
  assert.match(answer, /叶色/);
  assert.ok(context.trace.some((item) => item.startsWith('list_beijing_places(')));
  assert.ok(context.trace.some((item) => item.startsWith('build_beijing_route(')));
});

test('city route guard does not invent a ginkgo route outside the verified place catalog', async () => {
  const question = '今天下午在通州区看银杏，怎么安排？';
  const context = contextFor(question);
  const answer = await ensureCityRoute(question, '随便去一处吧。', context);
  assert.equal(context.beijingPlan, null);
  assert.match(answer, /未收录明确标注银杏/);
});

test('city route guard builds a full-day dining and sightseeing plan if Qwen skips the tool', async () => {
  const question = '我明天有一天时间，想吃吃北京的特色美食并出去逛逛';
  const context = contextFor(question);
  const answer = await ensureCityRoute(question, '可以随便逛逛。', context);
  assert.ok(context.beijingPlan);
  assert.equal(context.beijingPlanOptions?.minutes, 480);
  assert.match(answer, /预留用餐时间/);
  assert.notEqual(context.beijingPlan.origin.id, 'universal-beijing');
});
