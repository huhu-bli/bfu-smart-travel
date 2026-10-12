import test from 'node:test';
import assert from 'node:assert/strict';
import { routeScene } from './sceneRouter';

test('sceneRouter keeps a named campus route in campus mode', () => {
  assert.equal(routeScene('我有 3 小时，想去北京交通大学逛一逛'), 'campus-route');
});

test('sceneRouter routes Haidian day trips to outside-trip', () => {
  assert.equal(routeScene('周末想在海淀玩半天，别太贵'), 'outside-trip');
});

test('sceneRouter keeps an in-campus park in campus mode', () => {
  assert.equal(routeScene('我在北林校园里想逛公园并拍照'), 'campus-route');
});

test('sceneRouter keeps weather in the current travel scene when possible', () => {
  assert.equal(routeScene('明天会下雨吗？', 'campus-route'), 'campus-route');
});
