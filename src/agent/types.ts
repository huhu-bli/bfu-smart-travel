import type { PlanOptions, RoutePlan } from '../types';
import type { Scene } from '../lib/sceneRouter';

/** 直连 = 浏览器带着自己的 API Key 直接请求；代理 = 请求转发到自建 Serverless。 */
export type AgentMode = 'direct' | 'proxy';

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
  apiKey: string;
  /** 接口基地址，切换服务商时会自动填好，也可以手改。 */
  baseUrl: string;
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
