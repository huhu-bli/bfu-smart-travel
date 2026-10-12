import type { PlanOptions, RoutePlan } from '../types';
import type { Scene } from '../lib/sceneRouter';
import type { TravelTarget } from '../lib/travelTarget';

/** 公开站点统一通过受保护的 Vercel 代理访问模型。 */
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
  /** 兼容非浏览器调用；公开浏览器不注入此口令。 */
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
  target: TravelTarget;
  plan: RoutePlan | null;
  planOptions: PlanOptions | null;
  spotIds: string[];
  tripIds: string[];
  trace: string[];
}

export interface AgentTurnResult {
  scene: Scene;
  target: TravelTarget;
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
