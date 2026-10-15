import test from 'node:test';
import assert from 'node:assert/strict';
import { routeScene, sceneForTarget } from './sceneRouter';
import { resolveTravelTarget } from './travelTarget';

test('sceneRouter keeps a named campus route in campus mode', () => {
  assert.equal(routeScene('我有 3 小时，想去北京交通大学逛一逛'), 'campus-route');
});

test('sceneRouter routes Haidian day trips to outside-trip', () => {
  assert.equal(routeScene('周末想在海淀玩半天，别太贵'), 'outside-trip');
});

test('sceneRouter routes Beijing cross-district trips to outside-trip', () => {
  assert.equal(routeScene('一天想逛故宫、天坛和奥林匹克公园'), 'outside-trip');
});

test('sceneRouter keeps an in-campus park in campus mode', () => {
  assert.equal(routeScene('我在北林校园里想逛公园并拍照'), 'campus-route');
});

test('sceneRouter keeps weather in the current travel scene when possible', () => {
  assert.equal(routeScene('明天会下雨吗？', 'campus-route'), 'campus-route');
});

test('sceneRouter exposes city tools for an autumn route, including a campus follow-up switching districts', () => {
  const question = '今天下午在东城区、西城区看银杏，怎么安排？';
  const target = resolveTravelTarget(question, resolveTravelTarget('北京交通大学'));
  assert.deepEqual(target.districtIds, ['dongcheng', 'xicheng']);
  assert.equal(sceneForTarget(routeScene(question, 'campus-route'), target), 'outside-trip');
  assert.equal(routeScene('今天下午看银杏'), 'outside-trip');
  assert.equal(sceneForTarget(routeScene('月坛公园值得去吗'), resolveTravelTarget('月坛公园')), 'outside-trip');
});
