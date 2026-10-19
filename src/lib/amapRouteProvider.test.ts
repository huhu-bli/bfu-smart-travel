import { BEIJING_PLACES } from '../data/beijingPlaces';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PACES } from '../data/interests';
import { buildBeijingRoute } from './beijingPlanner';
import {
  applyAmapMeasurements,
  parseTransferResult,
  parseWalkingResult,
} from './routeProviders/amap';

test('parseWalkingResult extracts duration, distance and road path', () => {
  const result = parseWalkingResult({
    routes: [{
      time: 780,
      distance: 1200,
      steps: [{ path: [{ lng: 116.39, lat: 39.9 }, { lng: 116.4, lat: 39.91 }] }],
    }],
  });
  assert.deepEqual(result, {
    minutes: 13,
    distanceKm: 1.2,
    path: [[116.39, 39.9], [116.4, 39.91]],
    mode: '步行',
  });
});

test('parseTransferResult extracts the fastest public transport plan', () => {
  const result = parseTransferResult({
    plans: [{
      time: 2400,
      distance: 12800,
      segments: [{
        transit_mode: 'SUBWAY',
        transit: { path: [{ lng: 116.3, lat: 39.9 }, { lng: 116.45, lat: 39.92 }] },
      }],
    }],
  });
  assert.equal(result?.minutes, 40);
  assert.equal(result?.distanceKm, 12.8);
  assert.equal(result?.mode, '公共交通');
  assert.equal(result?.path.length, 2);
});

test('applyAmapMeasurements recalculates a Beijing plan without changing stop order', () => {
  const pace = PACES.find((item) => item.id === 'normal')!;
  const options = {
    scope: 'beijing' as const,
    interests: ['culture' as const],
    minutes: 480,
    pace,
    travelMode: 'mixed' as const,
    districtIds: ['dongcheng' as const, 'xicheng' as const],
    startPlaceId: 'forbidden-city',
    includePlaceIds: ['forbidden-city', 'temple-of-heaven', 'shichahai'],
    excludePlaceIds: [],
  };
  const estimate = buildBeijingRoute(options, BEIJING_PLACES);
  const ids = estimate.stops.map((stop) => stop.place.id);
  const measurements = estimate.stops.map((stop, index) => ({
    minutes: 20 + index,
    distanceKm: 3 + index,
    path: [[116.3 + index * 0.01, 39.9], [stop.place.lng, stop.place.lat]] as Array<[number, number]>,
    mode: stop.travelMode,
  }));
  const refined = applyAmapMeasurements(estimate, options, measurements);
  assert.deepEqual(refined.stops.map((stop) => stop.place.id), ids);
  assert.equal(refined.routeProvider, 'amap');
  assert.ok(refined.stops.every((stop) => stop.routeProvider === 'amap'));
  assert.equal(refined.stops[0].travelMinutes, 20);
});

test('applyAmapMeasurements keeps estimated legs when only part of AMap succeeds', () => {
  const pace = PACES.find((item) => item.id === 'normal')!;
  const options = {
    scope: 'beijing' as const,
    interests: ['culture' as const],
    minutes: 480,
    pace,
    travelMode: 'mixed' as const,
    districtIds: ['dongcheng' as const, 'xicheng' as const],
    startPlaceId: 'forbidden-city',
    includePlaceIds: ['forbidden-city', 'temple-of-heaven', 'shichahai'],
    excludePlaceIds: [],
  };
  const estimate = buildBeijingRoute(options, BEIJING_PLACES);
  const refined = applyAmapMeasurements(estimate, options, [{
    minutes: 25,
    distanceKm: 4,
    path: [[116.39, 39.9], [116.4, 39.91]],
    mode: '公共交通',
  }, null]);
  assert.equal(refined.routeProvider, 'hybrid');
  assert.equal(refined.stops[0].routeProvider, 'amap');
  assert.equal(refined.stops[1].routeProvider, 'estimate');
});
