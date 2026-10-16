import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AGENT_SETTINGS } from './config';
import { AgentHttpError, isRecoverableAgentFailure, ToolLoopLimitError } from './errors';
import { runChatLoop } from './toolLoop';
import { BEIJING_TARGET } from '../lib/travelTarget';
import type { AgentToolContext } from './types';

function cityContext(): AgentToolContext {
  return {
    target: BEIJING_TARGET, plan: null, planOptions: null,
    beijingPlan: null, beijingPlanOptions: null,
    spotIds: [], placeIds: [], tripIds: [], trace: [],
  };
}

test('temporary upstream failures and exhausted tool loop can use local planner, auth and quota cannot', () => {
  for (const status of [502, 503, 504]) {
    assert.equal(isRecoverableAgentFailure(new AgentHttpError(status, `请求失败（${status}）`)), true);
  }
  for (const status of [401, 403, 429]) {
    assert.equal(isRecoverableAgentFailure(new AgentHttpError(status, `请求失败（${status}）`)), false);
  }
  assert.equal(isRecoverableAgentFailure(new ToolLoopLimitError()), true);
  assert.equal(isRecoverableAgentFailure(new Error('浏览器无法连接代理服务')), true);
});

test('a repeated Qwen tool call reuses its result and the next request asks for a final answer', async () => {
  const context = cityContext();
  const payloads: Record<string, unknown>[] = [];
  const outcome = await runChatLoop(
    [], '明天一天想出去逛逛', DEFAULT_AGENT_SETTINGS, context, 'outside-trip', '',
    async (_settings, payload) => {
      payloads.push(payload);
      if (payloads.length === 3) return { choices: [{ message: { content: '路线安排好了。' } }] };
      return { choices: [{ message: { content: null, tool_calls: [{
        id: `call_${payloads.length}`, type: 'function',
        function: { name: 'list_beijing_places', arguments: '{"keyword":"","interests":[],"district_ids":[]}' },
      }] } }] };
    },
  );
  assert.equal(outcome.rounds, 3);
  assert.equal(outcome.text, '路线安排好了。');
  assert.equal(payloads[2].tool_choice, 'none');
  assert.deepEqual(payloads[2].tools, []);
  assert.equal(context.trace.filter((line) => line.startsWith('list_beijing_places(')).length, 1);
  assert.ok(context.trace.some((line) => line.includes('复用')));
});

test('Qwen cannot loop forever if it ignores tool_choice none', async () => {
  const context = cityContext();
  let requests = 0;
  await assert.rejects(
    runChatLoop([], '明天出去逛逛', DEFAULT_AGENT_SETTINGS, context, 'outside-trip', '',
      async () => ({ choices: [{ message: { content: null, tool_calls: [{
        id: `call_${++requests}`, type: 'function',
        function: { name: 'list_beijing_places', arguments: '{"keyword":"","interests":[],"district_ids":[]}' },
      }] } }] })),
    ToolLoopLimitError,
  );
  assert.equal(requests, 3);
});
