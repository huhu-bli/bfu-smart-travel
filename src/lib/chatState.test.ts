import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreChat } from './chatState';
import { buildBeijingRoute } from './beijingPlanner';
import { BEIJING_PLACES } from '../data/beijingPlaces';
import { PACES } from '../data/interests';
import { BEIJING_TARGET } from './travelTarget';

test('damaged chat turns, plans and metadata cannot reach rendering as invalid objects', () => {
  const restored = restoreChat(JSON.stringify({ protocol: 'chat', turns: [null, {}, { id: 'bad', role: 'assistant', text: {} },
    { id: 'ok', role: 'assistant', text: '保留文字', plan: {}, planOptions: {}, beijingPlan: { stops: null }, beijingPlanOptions: {},
      spotIds: 'not-an-array', trace: [null] }], history: {}, histories: [], activeScene: {}, activeTarget: { kind: 'campus' } }));
  assert.equal(restored?.turns.length, 1);
  assert.equal(restored.turns[0].text, '保留文字');
  for (const key of ['plan', 'beijingPlan', 'spotIds', 'trace'] as const) assert.equal(restored.turns[0][key], undefined);
  assert.deepEqual(restored.history, []);
  assert.deepEqual(restored.target, BEIJING_TARGET);
  assert.equal(restored.key, 'unknown:beijing');
  for (const raw of [null, '{bad', 'null', '{}', '{"protocol":"chat","turns":{}}']) assert.equal(restoreChat(raw), undefined);
});

test('valid saved text, route cards and tool history remain available after refresh', () => {
  const options = { scope: 'beijing' as const, interests: ['culture' as const], minutes: 480,
    pace: PACES[1], travelMode: 'mixed' as const, districtIds: [] };
  const plan = buildBeijingRoute(options, BEIJING_PLACES);
  const history = [{ role: 'user', content: '北京一天' }, { role: 'assistant', content: null,
    tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_beijing_places', arguments: '{}' } }] },
    { role: 'tool', content: '{}', tool_call_id: 'c1' }, { role: 'assistant', content: '路线已生成' }];
  const restored = restoreChat(JSON.stringify({ protocol: 'chat', activeScene: 'outside-trip', activeTarget: BEIJING_TARGET,
    activeConversationKey: {}, histories: { 'outside-trip:beijing': history }, turns: [{ id: 'turn-1', role: 'assistant',
      text: '路线已生成', beijingPlan: plan, beijingPlanOptions: options, trace: ['已查库'] }] }));
  assert.deepEqual(restored?.turns[0].beijingPlan, plan);
  assert.deepEqual(restored?.history, history);
  assert.equal(restored?.key, 'outside-trip:beijing');
  assert.notEqual(restored?.turns[0].id, 'turn-1');
});

test('invalid stored tool calls discard that model history while preserving displayed text', () => {
  const restored = restoreChat(JSON.stringify({ protocol: 'chat', turns: [{ id: '1', role: 'user', text: '你好' }],
    history: [{ role: 'assistant', content: null, tool_calls: [{ function: null }] }] }));
  assert.deepEqual(restored?.history, []);
  assert.equal(restored?.turns[0].text, '你好');
});
