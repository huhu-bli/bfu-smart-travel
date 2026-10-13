import test from 'node:test';
import assert from 'node:assert/strict';
import { PACES } from '../data/interests';
import { buildBeijingRoute, distanceKm } from './beijingPlanner';
import { BEIJING_PLACE_MAP, beijingPlacesFromText } from '../data/beijingPlaces';

const normalPace = PACES.find((item) => item.id === 'normal')!;

test('beijingPlanner keeps explicit Beijing destinations in a one-day route', () => {
  const plan = buildBeijingRoute({
    scope: 'beijing',
    interests: ['culture', 'photo'],
    minutes: 480,
    pace: normalPace,
    travelMode: 'mixed',
    districtIds: ['dongcheng', 'xicheng'],
    startPlaceId: 'forbidden-city',
    includePlaceIds: ['forbidden-city', 'temple-of-heaven', 'shichahai'],
    excludePlaceIds: [],
  });
  const ids = [plan.origin.id, ...plan.stops.map((stop) => stop.place.id)];
  assert.deepEqual(ids.slice(0, 3), ['forbidden-city', 'temple-of-heaven', 'shichahai']);
  assert.ok(plan.totalMinutes <= 480);
});

test('beijingPlanner honours excluded city destinations', () => {
  const plan = buildBeijingRoute({
    scope: 'beijing',
    interests: ['culture'],
    minutes: 300,
    pace: normalPace,
    travelMode: 'mixed',
    districtIds: ['dongcheng'],
    startPlaceId: 'forbidden-city',
    includePlaceIds: ['forbidden-city'],
    excludePlaceIds: ['temple-of-heaven'],
  });
  const ids = [
    plan.origin.id,
    ...plan.stops.map((stop) => stop.place.id),
    ...plan.optionalStops.map((stop) => stop.place.id),
  ];
  assert.ok(!ids.includes('temple-of-heaven'));
});

test('beijingPlanner computes plausible geographic distances', () => {
  const distance = distanceKm(BEIJING_PLACE_MAP['forbidden-city'], BEIJING_PLACE_MAP['temple-of-heaven']);
  assert.ok(distance > 2);
  assert.ok(distance < 8);
});

test('beijingPlanner keeps every selected stop in order when editing, even over budget', () => {
  const options = {
    scope: 'beijing' as const,
    interests: ['culture' as const, 'photo' as const],
    minutes: 480,
    pace: normalPace,
    travelMode: 'mixed' as const,
    districtIds: ['dongcheng' as const, 'xicheng' as const],
    startPlaceId: 'forbidden-city',
    includePlaceIds: ['forbidden-city', 'temple-of-heaven', 'shichahai', 'nanluoguxiang'],
    excludePlaceIds: [],
    preserveSelectedStops: true,
  };
  const added = buildBeijingRoute(options);
  assert.deepEqual(
    [added.origin.id, ...added.stops.map((stop) => stop.place.id)],
    options.includePlaceIds,
  );
  assert.ok(added.totalMinutes > options.minutes);
  assert.match(added.remainingAdvice, /超出预算/);

  const removed = buildBeijingRoute({
    ...options,
    includePlaceIds: ['forbidden-city', 'temple-of-heaven', 'shichahai'],
    excludePlaceIds: ['nanluoguxiang'],
  });
  assert.deepEqual(
    [removed.origin.id, ...removed.stops.map((stop) => stop.place.id)],
    ['forbidden-city', 'temple-of-heaven', 'shichahai'],
  );
  assert.ok(!removed.stops.some((stop) => stop.place.id === 'beihai-park'));
});

test('beijingPlanner exposes Beijing Jiaotong University as a searchable city place', () => {
  assert.equal(BEIJING_PLACE_MAP['beijing-jiaotong-university'].name, '北京交通大学');
  assert.equal(beijingPlacesFromText('北交大附近有什么景点')[0]?.id, 'beijing-jiaotong-university');
});

