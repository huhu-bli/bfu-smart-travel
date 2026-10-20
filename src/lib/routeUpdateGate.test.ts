import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteUpdateGate } from './routeUpdateGate';

test('a pending database edit prevents duplicate work and unlocks after a failure', async () => {
  const gate = createRouteUpdateGate();
  let reject: (error: Error) => void = () => {};
  const database = new Promise<never>((_resolve, fail) => { reject = fail; });
  let calls = 0;
  const edit = async () => {
    const ticket = gate.begin();
    if (ticket === undefined) return;
    calls += 1;
    try { await database; } finally { gate.finish(ticket); }
  };
  const first = edit();
  await edit();
  assert.equal(calls, 1);
  reject(new Error('database unavailable'));
  await assert.rejects(first, /database unavailable/);
  assert.notEqual(gate.begin(), undefined);
});

test('a superseded request can neither overwrite a new route nor unlock its active edit', async () => {
  const gate = createRouteUpdateGate();
  let completeOld: () => void = () => {};
  const oldRequest = new Promise<void>((resolve) => { completeOld = resolve; });
  let plan = 'new agent plan';
  const oldTicket = gate.begin()!;
  const stale = oldRequest.then(() => {
    if (gate.isCurrent(oldTicket)) plan = 'old route';
  }).finally(() => gate.finish(oldTicket));
  gate.invalidate();
  const newTicket = gate.begin()!;
  completeOld();
  await stale;
  assert.equal(plan, 'new agent plan');
  assert.equal(gate.begin(), undefined);
  assert.equal(gate.finish(newTicket), true);
  assert.notEqual(gate.begin(), undefined);
});
