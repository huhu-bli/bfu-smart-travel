import type { AgentProvider, AgentSettings, ChatMessage, ToolCall } from '../types';
import { providerOf } from '../config';
import { promptForScene } from '../../prompts/scenePrompts';
import { sceneTools, type Scene } from '../../lib/sceneRouter';
import { TOOL_SCHEMAS } from '../../lib/toolSchemas';

/** 统一工具定义转成 Chat Completions 结构。 */
export function toChatTools(scene: Scene = 'unknown'): Record<string, unknown>[] {
  return TOOL_SCHEMAS.filter((tool) => sceneTools(scene).includes(tool.name)).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function buildChatPayload(
  settings: AgentSettings,
  messages: ChatMessage[],
  scene: Scene = 'unknown',
  contextHint = '',
): Record<string, unknown> {
  const tools = toChatTools(scene);
  return {
    model: settings.model.trim() || providerOf(settings.provider).model,
    messages: [
      { role: 'system', content: [promptForScene(scene), contextHint].filter(Boolean).join('\n\n') },
      ...messages,
    ],
    tools,
    tool_choice: tools.length ? 'auto' : 'none',
    stream: false,
  };
}

export interface ChatTurn {
  text: string;
  toolCalls: ToolCall[];
  rawToolCalls?: NonNullable<ChatMessage['tool_calls']>;
}

export function parseChatResponse(response: unknown): ChatTurn {
  const choices = (response as { choices?: unknown[] } | null)?.choices;
  const message = (Array.isArray(choices) ? choices[0] : null) as
    | { message?: { content?: unknown; tool_calls?: unknown } }
    | null;
  const raw = message?.message;
  const text = typeof raw?.content === 'string' ? raw.content.trim() : '';
  const rawToolCalls = Array.isArray(raw?.tool_calls)
    ? (raw?.tool_calls as NonNullable<ChatMessage['tool_calls']>)
    : undefined;
  const toolCalls: ToolCall[] = (rawToolCalls ?? [])
    .filter((call) => call?.function?.name)
    .map((call) => ({
      name: call.function.name,
      callId: call.id || `call_${call.function.name}`,
      arguments: call.function.arguments ?? '{}',
    }));
  return { text, toolCalls, rawToolCalls };
}

export type { AgentProvider };

