import test from 'node:test';
import assert from 'node:assert/strict';
import { answerLocally } from './localAgent';

test('offline assistant builds an afternoon city route through the two recorded ginkgo parks', async () => {
  const answer = await answerLocally('今天下午在东城区、西城区看银杏，怎么安排？');
  assert.equal(answer.memory.scene, 'outside-trip');
  assert.equal(answer.beijingPlanOptions?.startHour, 14);
  assert.equal(answer.beijingPlanOptions?.minutes, 240);
  assert.match(answer.text, /地坛公园/);
  assert.match(answer.text, /月坛公园/);
  assert.match(answer.text, /叶色/);
});
