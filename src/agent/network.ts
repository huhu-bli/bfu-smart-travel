import { PROXY_TIMEOUT_MS, resolveEndpoint } from './config';
import { describeError, errorDetail, type ProbeResult } from './errors';
import type { AgentSettings } from './types';

/** 向模型发送一次已经构造好的请求。协议和工具循环由上层负责。 */
export async function requestModel(
  settings: AgentSettings,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const endpoint = resolveEndpoint(settings);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.proxyToken.trim()) headers['x-app-token'] = settings.proxyToken.trim();

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      `共享 Agent 请求失败：浏览器无法连接 Worker。${errorDetail(error)}`,
    );
  } finally {
    globalThis.clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(describeError(response.status, payload, settings));
  return payload ?? {};
}

/** 检查共享 Worker 是否可达，不向上游模型发送测试请求。 */
export async function probeConnection(settings: AgentSettings): Promise<ProbeResult> {
  const started = Date.now();
  const url = settings.proxyUrl.trim().replace(/\/+$/, '');
  if (!url) {
    return { ok: false, latencyMs: 0, message: '共享 Agent 服务暂时未配置。' };
  }

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 15_000);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: settings.proxyToken.trim() ? { 'x-app-token': settings.proxyToken.trim() } : {},
        signal: controller.signal,
      });
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: '共享 Agent 服务暂时不可达。',
        detail: errorDetail(error),
      };
    }

    const latencyMs = Date.now() - started;
    if (response.status === 401) {
      return { ok: false, status: 401, latencyMs, message: '共享 Agent 访问口令无效。' };
    }
    return {
      ok: true,
      status: response.status,
      latencyMs,
      message: `共享 Agent 可达（HTTP ${response.status}，${latencyMs} ms）。`,
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
}
