import test from 'node:test';
import assert from 'node:assert/strict';
import { PACES } from '../data/interests';
import { SPOTS } from '../data/spots';
import { buildRoute } from './planner';

test('planner keeps the route within the requested time budget', () => {
    const plan = buildRoute(SPOTS, {
      campusId: 'bfu',
      campusLabel: '北林',
      interests: ['plant', 'photo'],
      minutes: 60,
      pace: PACES[1],
      startId: 'gate-main',
    });
    assert.ok(plan.totalMinutes <= 60);
    assert.ok(plan.stops.length > 0);
});

test('planner honours explicit exclusions', () => {
    const plan = buildRoute(SPOTS, {
      campusId: 'bfu',
      campusLabel: '北林',
      interests: [],
      minutes: 120,
      pace: PACES[1],
      startId: 'gate-main',
      excludeSpotIds: ['ginkgo-avenue'],
    });
    assert.equal(plan.stops.some((stop) => stop.spot.id === 'ginkgo-avenue'), false);
});
