import { DEFAULT_AGENT_SETTINGS } from '../config';
import type { AgentInputItem, AgentSettings, ToolCall } from '../types';
import { promptForScene } from '../../prompts/scenePrompts';
import { sceneTools, type Scene } from '../../lib/sceneRouter';
import { TOOL_SCHEMAS } from '../../lib/toolSchemas';

export function buildRequestPayload(
  settings: AgentSettings,
  input: AgentInputItem[],
  scene: Scene = 'unknown',
  contextHint = '',
): Record<string, unknown> {
  const tools = TOOL_SCHEMAS.filter((tool) => sceneTools(scene).includes(tool.name));
  return {
    model: settings.model.trim() || DEFAULT_AGENT_SETTINGS.model,
    instructions: [promptForScene(scene), contextHint].filter(Boolean).join('\n\n'),
    input,
    tools,
    tool_choice: tools.length ? 'auto' : 'none',
    parallel_tool_calls: false,
  };
}

export function extractToolCalls(response: unknown): ToolCall[] {
  const output = (response as { output?: unknown[] } | null)?.output;
  if (!Array.isArray(output)) return [];
  return output
    .filter(
      (item): item is { type: string; name: string; call_id: string; arguments?: string } =>
        Boolean(item) && (item as { type?: string }).type === 'function_call',
    )
    .map((item) => ({
      name: item.name,
      callId: item.call_id,
      arguments: item.arguments ?? '{}',
    }));
}

export function extractOutputText(response: unknown): string {
  const payload = response as { output_text?: unknown; output?: unknown[] } | null;
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of payload?.output ?? []) {
    const message = item as { type?: string; content?: unknown[] };
    if (message?.type !== 'message' || !Array.isArray(message.content)) continue;
    for (const chunk of message.content) {
      const part = chunk as { type?: string; text?: unknown };
      if (part?.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
  }
  return parts.join('\n').trim();
}

