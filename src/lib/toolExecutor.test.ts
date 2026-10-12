import test from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from './toolExecutor';

function districtContext() {
  return {
    target: { kind: 'district' as const, label: '海淀区', routeSupported: true, explicit: true },
    plan: null,
    planOptions: null,
    spotIds: [],
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
