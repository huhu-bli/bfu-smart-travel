import { MAX_ROUNDS } from './config';
import { buildChatPayload, parseChatResponse } from './transports/chat';
import { buildRequestPayload, extractOutputText, extractToolCalls } from './transports/responses';
import { trimHistory } from './history';
import type {
  AgentInputItem,
  AgentSettings,
  AgentToolContext,
  AgentHistory,
  ChatMessage,
} from './types';
import type { Scene } from '../lib/sceneRouter';
import { runTool } from '../lib/toolExecutor';

const EMPTY_REPLY = '（模型没有返回文字，换个问法再试一次。）';

export interface LoopOutcome {
  text: string;
  history: AgentHistory;
  rounds: number;
  trimmed: boolean;
}

type RequestModel = (
  settings: AgentSettings,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export async function runResponsesLoop(
  history: AgentInputItem[],
  userText: string,
  settings: AgentSettings,
  context: AgentToolContext,
  scene: Scene,
  contextHint: string,
  requestModel: RequestModel,
): Promise<LoopOutcome> {
  const trimmedHistory = trimHistory(history);
  let input: AgentInputItem[] = [
    ...(trimmedHistory.history as AgentInputItem[]),
    { role: 'user', content: userText },
  ];

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = await requestModel(settings, buildRequestPayload(settings, input, scene, contextHint));
    const output = (response.output as AgentInputItem[] | undefined) ?? [];
    input = [...input, ...output];

    const calls = extractToolCalls(response);
    if (!calls.length) {
      return {
        text: extractOutputText(response) || EMPTY_REPLY,
        history: input,
        rounds: round,
        trimmed: trimmedHistory.trimmed,
      };
    }

    for (const call of calls) {
      input.push({
        type: 'function_call_output',
        call_id: call.callId,
        output: runTool(call.name, call.arguments, context),
      });
    }
  }

  throw new Error('工具调用轮次过多，把问题拆小一点再试。');
}

export async function runChatLoop(
  history: ChatMessage[],
  userText: string,
  settings: AgentSettings,
  context: AgentToolContext,
  scene: Scene,
  contextHint: string,
  requestModel: RequestModel,
): Promise<LoopOutcome> {
  const trimmedHistory = trimHistory(history);
  let messages: ChatMessage[] = [...(trimmedHistory.history as ChatMessage[]), { role: 'user', content: userText }];

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = await requestModel(settings, buildChatPayload(settings, messages, scene, contextHint));
    const turn = parseChatResponse(response);

    const assistant: ChatMessage = {
      role: 'assistant',
      content: turn.text || null,
    };
    if (turn.rawToolCalls?.length) assistant.tool_calls = turn.rawToolCalls;
    messages = [...messages, assistant];

    if (!turn.toolCalls.length) {
      return {
        text: turn.text || EMPTY_REPLY,
        history: messages,
        rounds: round,
        trimmed: trimmedHistory.trimmed,
      };
    }

    for (const call of turn.toolCalls) {
      messages.push({
        role: 'tool',
        tool_call_id: call.callId,
        content: runTool(call.name, call.arguments, context),
      });
    }
  }

  throw new Error('工具调用轮次过多，把问题拆小一点再试。');
}

