import { fixturePlaces } from '../../test/support/fixturePlaces';
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerLocally } from './localAgent';

test('offline assistant builds an afternoon city route through the two recorded ginkgo parks', async () => {
  const answer = await answerLocally('今天下午在东城区、西城区看银杏，怎么安排？', null, fixturePlaces);
  assert.equal(answer.memory.scene, 'outside-trip');
  assert.equal(answer.beijingPlanOptions?.startHour, 14);
  assert.equal(answer.beijingPlanOptions?.minutes, 240);
  assert.match(answer.text, /地坛公园/);
  assert.match(answer.text, /月坛公园/);
  assert.match(answer.text, /叶色/);
});

test('a full day food and sightseeing question gets a usable city plan with a dining area', async () => {
  const answer = await answerLocally('我明天有一天时间 想吃吃北京的特色美食 并且出去逛逛', null, fixturePlaces);
  assert.equal(answer.memory.scene, 'outside-trip');
  assert.equal(answer.beijingPlanOptions?.minutes, 480);
  assert.ok(answer.beijingPlan);
  assert.ok(answer.beijingPlan.totalMinutes <= 480);
  assert.ok([answer.beijingPlan.origin, ...answer.beijingPlan.stops.map((stop) => stop.place)]
    .some((place) => place.category === 'neighborhood' && place.interests.includes('food')));
  assert.match(answer.text, /用餐建议/);
  assert.doesNotMatch(answer.text, /通州区 · 美食生活路线/);
});

test('an explicitly requested theme park remains selectable for a full-day food question', async () => {
  const answer = await answerLocally('明天一整天去北京环球度假区吃吃逛逛', null, fixturePlaces);
  assert.equal(answer.beijingPlan?.origin.id, 'universal-beijing');
});
