import type { AgentProvider, AgentProviderId, AgentSettings } from './types';

export const PROVIDERS: AgentProvider[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'chat',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-...',
    note: '国内可直连，浏览器跨域已实测放行。「deepseek-chat」支持工具调用。',
  },
  {
    id: 'qwen',
    label: '通义千问',
    protocol: 'chat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.8-flash',
    models: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus'],
    keyHint: 'sk-...',
    note: '阿里云百炼，国内直连、响应很快。新用户有免费额度，额度以控制台为准。',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'responses',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6-astra',
    models: ['gpt-6-astra', 'gpt-5.6', 'gpt-5.4'],
    keyHint: 'sk-...',
    note: '国内网络常无法直连，且部分网络会拦截 POST，建议配代理模式。',
  },
  {
    id: 'custom',
    label: '自定义',
    protocol: 'chat',
    baseUrl: '',
    model: '',
    models: [],
    keyHint: '按服务商要求填写',
    note: '任何 OpenAI 兼容接口都可以，填到 /v1 这一层为止。',
  },
];

export const DIRECT_BASE = 'https://api.openai.com/v1';
export const MAX_ROUNDS = 6;
export const REQUEST_TIMEOUT_MS = 60_000;
export const PROXY_TIMEOUT_MS = 20_000;

/** 发给模型的历史最多保留最近 10 轮。 */
export const MAX_HISTORY_GROUPS = 10;
/** 历史体积硬上限。 */
export const MAX_HISTORY_CHARS = 60_000;

export function providerOf(id: AgentProviderId): AgentProvider {
  return PROVIDERS.find((item) => item.id === id) ?? PROVIDERS[0];
}

function readSiteEnv(key: string): string {
  const bag = (globalThis as { __BFU_ENV__?: Record<string, unknown> }).__BFU_ENV__;
  const raw = bag?.[key];
  if (typeof raw !== 'string') return '';
  return raw.startsWith('%') ? '' : raw.trim();
}

const SITE_PROXY_URL = readSiteEnv('VITE_AGENT_PROXY_URL');
const SITE_PROXY_TOKEN = readSiteEnv('VITE_AGENT_PROXY_TOKEN');
/** 站点级密钥会随网页公开，仅保留兼容能力，不应作为公开部署的首选。 */
const SITE_API_KEY = readSiteEnv('VITE_AGENT_API_KEY');
const SITE_PROVIDER_ENV = readSiteEnv('VITE_AGENT_PROVIDER');

const SITE_PROVIDER: AgentProviderId =
  SITE_PROVIDER_ENV && PROVIDERS.some((item) => item.id === SITE_PROVIDER_ENV)
    ? (SITE_PROVIDER_ENV as AgentProviderId)
    : SITE_API_KEY
      ? 'qwen'
      : 'deepseek';
const SITE_PRESET = providerOf(SITE_PROVIDER);

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  // 兼容现有站点配置：没有代理时直连；有站点密钥时保持原有直连行为。
  mode: SITE_API_KEY || !SITE_PROXY_URL ? 'direct' : 'proxy',
  provider: SITE_PROVIDER,
  protocol: SITE_PRESET.protocol,
  apiKey: SITE_API_KEY,
  baseUrl: SITE_PRESET.baseUrl,
  proxyUrl: SITE_PROXY_URL,
  proxyToken: SITE_PROXY_TOKEN,
  model: SITE_PRESET.model,
};

export const SITE_DIRECT_FALLBACK: AgentSettings | null = SITE_API_KEY
  ? {
      mode: 'direct',
      provider: SITE_PROVIDER,
      protocol: SITE_PRESET.protocol,
      apiKey: SITE_API_KEY,
      baseUrl: SITE_PRESET.baseUrl,
      proxyUrl: '',
      proxyToken: '',
      model: SITE_PRESET.model,
    }
  : null;

export function resolveBase(settings: AgentSettings): string {
  const custom = (settings.baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!custom) {
    return settings.provider === 'openai' ? DIRECT_BASE : providerOf(settings.provider).baseUrl;
  }
  if (!/^https?:\/\//i.test(custom)) {
    throw new Error('API 地址需要以 https:// 或 http:// 开头。');
  }
  return custom;
}

export function resolveEndpoint(settings: AgentSettings): string {
  const path = settings.protocol === 'chat' ? '/chat/completions' : '/responses';
  if (settings.mode === 'proxy') {
    const url = settings.proxyUrl.trim().replace(/\/+$/, '');
    if (!url) throw new Error('还没有填写代理地址。');
    if (!/^https?:\/\//i.test(url)) throw new Error('代理地址需要以 https:// 或 http:// 开头。');
    return `${url}${path}`;
  }
  if (!settings.apiKey.trim()) throw new Error('还没有填写 API Key。');
  return `${resolveBase(settings)}${path}`;
}

