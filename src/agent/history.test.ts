import test from 'node:test';
import assert from 'node:assert/strict';
import { trimHistory } from './history';
import { AgentContextLimitError } from './errors';
import { DEFAULT_AGENT_SETTINGS, MAX_HISTORY_CHARS } from './config';
import { runChatLoop } from './toolLoop';
import { fixturePlaces } from '../../test/support/fixturePlaces';
import { BEIJING_TARGET } from '../lib/travelTarget';
import type { AgentToolContext, ChatMessage } from './types';

const group = (n: number): ChatMessage[] => [{ role: 'user', content: `问题${n}` },
  { role: 'assistant', content: null, tool_calls: [{ id: `old${n}`, type: 'function', function: { name: 'list_beijing_places', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: `old${n}`, content: '{}' }, { role: 'assistant', content: '已回复' }];
const context = (): AgentToolContext => ({ placeRepository: fixturePlaces, target: BEIJING_TARGET,
  plan: null, planOptions: null, beijingPlan: null, beijingPlanOptions: null,
  spotIds: [], placeIds: [], tripIds: [], trace: [] });

test('history respects the server message limit while retaining complete recent user/tool groups', () => {
  const result = trimHistory(Array.from({ length: 10 }, (_, n) => group(n)).flat());
  assert.equal(result.trimmed, true);
  assert.ok(result.history.length <= 28);
  assert.equal(result.history[0].role, 'user');
  assert.equal(result.history[result.history.length - 1].content, '已回复');
  assert.ok(result.history.some((m) => m.content === '问题9'));
});

test('every request is re-bounded after tools append results, without orphan tool messages', async () => {
  let count = 0;
  const result = await runChatLoop(Array.from({ length: 10 }, (_, n) => group(n)).flat(), '再查两处',
    DEFAULT_AGENT_SETTINGS, context(), 'outside-trip', '', async (_settings, payload) => {
      const messages = payload.messages as ChatMessage[];
      assert.ok(messages.length <= 30);
      const calls = new Set(messages.flatMap((m) => m.tool_calls?.map((c) => c.id) ?? []));
      for (const m of messages) if (m.role === 'tool') assert.ok(calls.has(m.tool_call_id!));
      if (++count === 1) return { choices: [{ message: { tool_calls: ['故宫', '天坛'].map((name, i) => ({
        id: `new${i}`, type: 'function', function: { name: 'list_beijing_places', arguments: JSON.stringify({ keyword: name }) },
      })) } }] };
      return { choices: [{ message: { content: '已查到' } }] };
    });
  assert.equal(count, 2);
  assert.equal(result.trimmed, true);
  assert.equal(result.text, '已查到');
});

test('a single oversized user/tool round stops locally rather than sending an invalid or partial request', async () => {
  assert.throws(() => trimHistory([{ role: 'user', content: 'x'.repeat(MAX_HISTORY_CHARS) }]), AgentContextLimitError);
  let requests = 0;
  await assert.rejects(runChatLoop([], '查询', DEFAULT_AGENT_SETTINGS, context(), 'outside-trip', '', async () => {
    requests += 1;
    return { choices: [{ message: { tool_calls: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, type: 'function',
      function: { name: 'list_beijing_places', arguments: '{}' } })) } }] };
  }), AgentContextLimitError);
  assert.equal(requests, 1);
});
