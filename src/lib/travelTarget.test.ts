import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTravelTarget } from './travelTarget';

test('travelTarget recognises Beijing Jiaotong University independently', () => {
  const target = resolveTravelTarget('我想去北京交通大学逛三个小时');
  assert.equal(target.kind, 'campus');
  assert.equal(target.campusId, 'bjtu');
});

test('travelTarget ignores an excluded campus after the requested destination', () => {
  const previous = resolveTravelTarget('东城区看银杏');
  const target = resolveTravelTarget('改去北京交通大学，只在校园内逛3小时，请从数据库查询北交点位，不要用北林点位。', previous);
  assert.equal(target.kind, 'campus');
  assert.equal(target.campusId, 'bjtu');
});

test('travelTarget ignores excluded campus aliases before the requested destination', () => {
  for (const text of ['不去北林，去北交', '不要用北京林业大学的路线，安排北京交通大学', '不想再去北林和清华，去北交']) {
    assert.equal(resolveTravelTarget(text).campusId, 'bjtu', text);
  }
});

test('travelTarget prioritises the new destination over the campus being left', () => {
  for (const text of ['从北林改去北交逛三个小时', '北交不去了，改成北林', '不要北林的地图改去北交']) {
    assert.equal(resolveTravelTarget(text).campusId, text.includes('改成北林') ? 'bfu' : 'bjtu', text);
  }
});

test('travelTarget still supports a return to BFU and an unnamed follow-up', () => {
  const bjtu = resolveTravelTarget('北交');
  const bfu = resolveTravelTarget('换成北林，不用北交的点位', bjtu);
  assert.equal(bfu.campusId, 'bfu');
  assert.equal(resolveTravelTarget('改成2小时', bfu).campusId, 'bfu');
  assert.equal(resolveTravelTarget('改去北大，不要北林').campusId, 'pku');
  assert.equal(resolveTravelTarget('改去北大，不要北林').routeSupported, false);
});

test('travelTarget does not carry a previous campus into an explicit Haidian trip', () => {
  const previous = resolveTravelTarget('北京交通大学');
  const target = resolveTravelTarget('周末在海淀玩半天', previous);
  assert.equal(target.kind, 'district');
  assert.equal(target.campusId, undefined);
});

test('travelTarget recognises Beijing city travel', () => {
  const target = resolveTravelTarget('我想规划北京市一日游');
  assert.equal(target.kind, 'city');
  assert.equal(target.label, '北京市');
});

test('travelTarget narrows an explicit district route', () => {
  const target = resolveTravelTarget('想在朝阳区逛半天');
  assert.equal(target.kind, 'district');
  assert.deepEqual(target.districtIds, ['chaoyang']);
});
