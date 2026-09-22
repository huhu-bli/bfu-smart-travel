import type { PlanOptions, RoutePlan } from '../types';
import type { Scene } from '../lib/sceneRouter';

/** 公开站点统一通过受保护的 Worker 访问模型。 */
export type AgentMode = 'proxy';

/** 当前公开 Agent 只接入通义千问，协议固定为 Chat Completions。 */
export type AgentProtocol = 'chat';

export type AgentProviderId = 'qwen';

export interface AgentProvider {
  id: AgentProviderId;
  label: string;
  protocol: AgentProtocol;
  baseUrl: string;
  model: string;
  models: string[];
  keyHint: string;
  note: string;
}

export interface AgentSettings {
  mode: AgentMode;
  provider: AgentProviderId;
  protocol: AgentProtocol;
  proxyUrl: string;
  /** 代理模式下的访问口令，对应 Worker 的 APP_TOKEN。 */
  proxyToken: string;
  model: string;
}

export type AgentInputItem = Record<string, unknown>;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

export type AgentHistory = AgentInputItem[] | ChatMessage[];

export interface ToolCall {
  name: string;
  callId: string;
  arguments: string;
}

export interface AgentToolContext {
  plan: RoutePlan | null;
  planOptions: PlanOptions | null;
  spotIds: string[];
  tripIds: string[];
  trace: string[];
}

export interface AgentTurnResult {
  scene: Scene;
  text: string;
  history: AgentHistory;
  /** 是否因为过长而省略了较早的对话。 */
  trimmed: boolean;
  plan: RoutePlan | null;
  planOptions: PlanOptions | null;
  spotIds: string[];
  tripIds: string[];
  trace: string[];
  rounds: number;
}
