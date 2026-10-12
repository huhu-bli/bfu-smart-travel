import test from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from './toolExecutor';

function districtContext() {
  return {
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
