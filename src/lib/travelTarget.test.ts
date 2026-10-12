import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTravelTarget } from './travelTarget';

test('travelTarget recognises Beijing Jiaotong University independently', () => {
  const target = resolveTravelTarget('我想去北京交通大学逛三个小时');
  assert.equal(target.kind, 'campus');
  assert.equal(target.campusId, 'bjtu');
});

test('travelTarget does not carry a previous campus into an explicit Haidian trip', () => {
  const previous = resolveTravelTarget('北京交通大学');
  const target = resolveTravelTarget('周末在海淀玩半天', previous);
  assert.equal(target.kind, 'district');
  assert.equal(target.campusId, undefined);
});
