import { fixturePlaces } from '../../test/support/fixturePlaces';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from './toolExecutor';
import { resolveTravelTarget } from './travelTarget';
import type { AgentToolContext } from '../agent/types';

function districtContext() {
  return {
    placeRepository: fixturePlaces,
    target: { kind: 'district' as const, label: '海淀区', routeSupported: true, explicit: true },
    plan: null,
    planOptions: null,
    beijingPlan: null,
    beijingPlanOptions: null,
    spotIds: [],
    placeIds: [],
    tripIds: [],
    trace: [],
  };
}

test('toolExecutor does not return a half-day trip above the requested budget', async () => {
    const result = JSON.parse(
      await runTool(
        'suggest_trip',
        JSON.stringify({ duration: 'half', theme: '', budget_max: 20 }),
        districtContext(),
      ),
    ) as { trips: unknown[]; budgetMatched: boolean };
    assert.equal(result.trips.length, 0);
    assert.equal(result.budgetMatched, false);
});

test('toolExecutor builds a structured Beijing route that can enter the global plan', async () => {
  const context = districtContext();
  const result = JSON.parse(
    await runTool(
      'build_beijing_route',
      JSON.stringify({
        minutes: 480,
        interests: ['culture', 'photo'],
        district_ids: [],
        pace: 'normal',
        travel_mode: 'mixed',
        start_place_id: 'forbidden-city',
        include_place_ids: ['forbidden-city', 'temple-of-heaven', 'shichahai'],
        exclude_place_ids: [],
      }),
      context,
    ),
  ) as { mustSeeStops: Array<{ placeId: string }>; totalMinutes: number };
  assert.ok(context.beijingPlan);
  assert.ok(context.beijingPlanOptions);
  assert.equal(result.mustSeeStops[0].placeId, 'forbidden-city');
  assert.ok(result.mustSeeStops.some((stop) => stop.placeId === 'temple-of-heaven'));
  assert.ok(result.totalMinutes <= 480);
});

test('toolExecutor returns a matching trip when the budget is sufficient', async () => {
    const result = JSON.parse(
      await runTool(
        'suggest_trip',
        JSON.stringify({ duration: 'half', theme: '', budget_max: 50 }),
        districtContext(),
      ),
    ) as { trips: Array<{ budget: string }>; budgetMatched: boolean };
    assert.equal(result.budgetMatched, true);
    assert.ok(result.trips.length > 0);
});

test('toolExecutor keeps a city-to-BJTU follow-up within the target campus despite wrong model arguments', async () => {
  const context: AgentToolContext = {
    ...districtContext(),
    target: resolveTravelTarget('改去北京交通大学，只在校园内逛3小时，不要用北林点位。', resolveTravelTarget('东城区看银杏')),
  };
  const listed = JSON.parse(await runTool('list_spots', JSON.stringify({ campus_id: 'bfu' }), context));
  assert.equal(listed.campusId, 'bjtu');
  assert.ok(listed.spots.length > 0);
  assert.ok(listed.spots.every((spot: { id: string }) => spot.id.startsWith('bjtu-')));
  const built = JSON.parse(await runTool('build_route', JSON.stringify({ campus_id: 'bfu', minutes: 180 }), context));
  assert.equal(built.campusId, 'bjtu');
  assert.equal(context.planOptions?.campusId, 'bjtu');
  assert.ok(context.plan?.stops.length);
  assert.ok(context.plan!.stops.every((stop) => stop.spot.id.startsWith('bjtu-')));
  assert.ok(context.plan!.totalMinutes <= 180);
});
