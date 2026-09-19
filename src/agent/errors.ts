import { providerOf } from './config';
import type { AgentSettings } from './types';

export interface ProbeResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  message: string;
  detail?: string;
}

export function errorDetail(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function describeError(status: number, payload: unknown, settings: AgentSettings): string {
  const message = (payload as { error?: { message?: string } } | null)?.error?.message;
  const detail = message ? `：${message}` : '';
  const provider = providerOf(settings.provider).label;
  switch (status) {
    case 400:
      return `请求被拒绝（400）${detail}`;
    case 401:
      return settings.mode === 'direct'
        ? `${provider} 的 API Key 无效或已过期（401），请重新填写。`
        : '代理拒绝了请求（401），检查代理上的密钥或访问口令。';
    case 403:
      return `当前密钥没有访问该模型的权限（403）${detail}`;
    case 404:
      return `模型「${settings.model}」不存在或你的账号不可用（404），可以换成 ${
        providerOf(settings.provider).models.slice(0, 2).join(' / ') || '服务商支持的模型'
      }。`;
    case 429:
      return `${provider} 触发限流或额度不足（429），稍后再试或检查服务商后台用量。`;
    default:
      return `请求失败（${status}）${detail}`;
  }
}

