import type { AgentProvider, AgentProviderId, AgentSettings } from './types';

const QWEN_PROVIDER: AgentProvider = {
  id: 'qwen',
  label: '通义千问',
  protocol: 'chat',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.8-flash',
  models: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus'],
  keyHint: 'sk-...',
  note: '公开站点通过 Cloudflare Worker 调用，千问 API Key 保存在 Worker 中。',
};

export const PROVIDERS: AgentProvider[] = [QWEN_PROVIDER];
export const DIRECT_BASE = QWEN_PROVIDER.baseUrl;
export const MAX_ROUNDS = 6;
export const REQUEST_TIMEOUT_MS = 60_000;
export const PROXY_TIMEOUT_MS = 20_000;

/** 发给模型的历史最多保留最近 10 轮。 */
export const MAX_HISTORY_GROUPS = 10;
/** 历史体积硬上限。 */
export const MAX_HISTORY_CHARS = 60_000;

export function providerOf(_id: AgentProviderId): AgentProvider {
  return QWEN_PROVIDER;
}

function readSiteEnv(key: string): string {
  const bag = (globalThis as { __BFU_ENV__?: Record<string, unknown> }).__BFU_ENV__;
  const raw = bag?.[key];
  if (typeof raw !== 'string') return '';
  return raw.startsWith('%') ? '' : raw.trim();
}

const SITE_PROXY_URL = readSiteEnv('VITE_AGENT_PROXY_URL');
const SITE_PROXY_TOKEN = readSiteEnv('VITE_AGENT_PROXY_TOKEN');

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  // 公开站点始终优先使用共享代理；本地开发没有代理配置时才允许手动直连。
  mode: SITE_PROXY_URL ? 'proxy' : 'direct',
  provider: 'qwen',
  protocol: 'chat',
  apiKey: '',
  baseUrl: QWEN_PROVIDER.baseUrl,
  proxyUrl: SITE_PROXY_URL,
  proxyToken: SITE_PROXY_TOKEN,
  model: QWEN_PROVIDER.model,
};

/** 不在公开构建中提供站点级直连密钥，避免任何 API Key 进入浏览器。 */
export const SITE_DIRECT_FALLBACK: AgentSettings | null = null;

export function resolveBase(settings: AgentSettings): string {
  const custom = (settings.baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!custom) return QWEN_PROVIDER.baseUrl;
  if (!/^https?:\/\//i.test(custom)) {
    throw new Error('API 地址需要以 https:// 或 http:// 开头。');
  }
  return custom;
}

export function resolveEndpoint(settings: AgentSettings): string {
  if (settings.mode === 'proxy') {
    const url = settings.proxyUrl.trim().replace(/\/+$/, '');
    if (!url) throw new Error('还没有填写代理地址。');
    if (!/^https?:\/\//i.test(url)) throw new Error('代理地址需要以 https:// 或 http:// 开头。');
    return `${url}/chat/completions`;
  }
  if (!settings.apiKey.trim()) throw new Error('还没有填写 API Key。');
  return `${resolveBase(settings)}/chat/completions`;
}
