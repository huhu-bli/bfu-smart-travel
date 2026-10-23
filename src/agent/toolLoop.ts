import { MAX_CHAT_MESSAGES, MAX_ROUNDS } from './config';
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
import { ToolLoopLimitError } from './errors';

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
  let trimmed = trimmedHistory.trimmed;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const bounded = trimHistory(input);
    input = bounded.history as AgentInputItem[];
    trimmed ||= bounded.trimmed;
    const response = await requestModel(settings, buildRequestPayload(settings, input, scene, contextHint));
    const output = (response.output as AgentInputItem[] | undefined) ?? [];
    input = [...input, ...output];

    const calls = extractToolCalls(response);
    if (!calls.length) {
      return {
        text: extractOutputText(response) || EMPTY_REPLY,
        history: input,
        rounds: round,
        trimmed,
      };
    }

    for (const call of calls) {
      input.push({
        type: 'function_call_output',
        call_id: call.callId,
        output: await runTool(call.name, call.arguments, context),
      });
    }
  }

  throw new ToolLoopLimitError();
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
  let trimmed = trimmedHistory.trimmed;
  const toolResults = new Map<string, string>();
  let finishWithoutTools = false;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    // 每次工具返回后重新检查；只丢弃完整的旧用户轮次，保留当前调用与结果配对。
    const bounded = trimHistory(messages, MAX_CHAT_MESSAGES - 1);
    messages = bounded.history as ChatMessage[];
    trimmed ||= bounded.trimmed;
    const payload = buildChatPayload(settings, messages, scene, contextHint);
    if (finishWithoutTools || round === MAX_ROUNDS) {
      payload.tool_choice = 'none';
      payload.tools = [];
    }
    const response = await requestModel(settings, payload);
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
        trimmed,
      };
    }

    // 如果服务商未遵守 tool_choice=none，不继续请求，也不留下未配对的工具调用。
    if (payload.tool_choice === 'none') throw new ToolLoopLimitError();

    for (const call of turn.toolCalls) {
      const signature = `${call.name}:${call.arguments}`;
      const cached = toolResults.get(signature);
      if (cached !== undefined) {
        finishWithoutTools = true;
        context.trace.push(`tool_loop(复用 ${call.name} 的结果)`);
      }
      const output = cached ?? await runTool(call.name, call.arguments, context);
      toolResults.set(signature, output);
      messages.push({
        role: 'tool',
        tool_call_id: call.callId,
        content: output,
      });
    }
  }

  throw new ToolLoopLimitError();
}

