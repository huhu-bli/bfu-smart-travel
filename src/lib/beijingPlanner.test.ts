import test from 'node:test';
import assert from 'node:assert/strict';
import { PACES } from '../data/interests';
import { buildBeijingRoute, distanceKm } from './beijingPlanner';
import { BEIJING_PLACE_MAP } from '../data/beijingPlaces';

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

