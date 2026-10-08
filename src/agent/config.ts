import type { AgentProvider, AgentProviderId, AgentSettings } from './types';

const QWEN_PROVIDER: AgentProvider = {
  id: 'qwen',
  label: '通义千问',
  protocol: 'chat',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.8-flash',
  models: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus'],
  keyHint: '由 Vercel 服务端安全保存',
  note: '公开站点统一通过 Vercel Serverless Function 调用，千问 API Key 不进入浏览器。',
};

export const PROVIDERS: AgentProvider[] = [QWEN_PROVIDER];
export const MAX_ROUNDS = 6;
export const REQUEST_TIMEOUT_MS = 60_000;
// 服务端代理冷启动时可能需要更长时间，避免前端过早触发 AbortError。
export const PROXY_TIMEOUT_MS = 60_000;

/** 发给模型的历史最多保留最近 10 轮。 */
export const MAX_HISTORY_GROUPS = 10;
/** 历史体积硬上限。 */
export const MAX_HISTORY_CHARS = 60_000;

export function providerOf(_id: AgentProviderId): AgentProvider {
  return QWEN_PROVIDER;
}

// 代理地址是公开配置，固定在前端；真正的千问 API Key 仅保存在 Vercel 服务端。
const SITE_PROXY_URL = 'https://bfu-smart-travel.vercel.app/api';

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  mode: 'proxy',
  provider: 'qwen',
  protocol: 'chat',
  proxyUrl: SITE_PROXY_URL,
  proxyToken: '',
  model: QWEN_PROVIDER.model,
};

export function resolveEndpoint(settings: AgentSettings): string {
  const url = settings.proxyUrl.trim().replace(/\/+$/, '');
  if (!url) throw new Error('共享 Agent 服务暂时未配置。');
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('共享 Agent 地址配置无效。');
  }
  return url + '/chat/completions';
}
