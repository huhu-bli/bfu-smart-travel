import { PROXY_TIMEOUT_MS, resolveEndpoint } from './config';
import { AgentHttpError, describeError, errorDetail, type ProbeResult } from './errors';
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
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (controller.signal.aborted) throw new DOMException('请求超时。', 'AbortError');
    if (!response.ok) throw new AgentHttpError(response.status, describeError(response.status, payload, settings));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AgentHttpError(502, '共享 Agent 返回了无效数据，请稍后重试。');
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (controller.signal.aborted) throw new AgentHttpError(504, '共享 Agent 请求超时，请稍后重试。');
    if (error instanceof AgentHttpError) throw error;
    throw new Error(
      `共享 Agent 请求失败：浏览器无法连接代理服务。${errorDetail(error)}`,
    );
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/** 检查共享代理服务是否可达，不向上游模型发送测试请求。 */
export async function probeConnection(settings: AgentSettings): Promise<ProbeResult> {
  const started = Date.now();
  if (!settings.proxyUrl.trim()) {
    return { ok: false, latencyMs: 0, message: '共享 Agent 服务暂时未配置。' };
  }
  let url: string;
  try { url = resolveEndpoint(settings); }
  catch { return { ok: false, latencyMs: 0, message: '共享 Agent 地址配置无效。' }; }

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

    const payload = await response.json().catch(() => null) as { ok?: unknown; error?: { message?: unknown } } | null;
    const latencyMs = Date.now() - started;
    if (controller.signal.aborted) return { ok: false, latencyMs, message: '共享 Agent 连接检查超时。' };
    if (response.status === 401) {
      return { ok: false, status: 401, latencyMs, message: '共享 Agent 访问口令无效。' };
    }
    if (!response.ok) {
      const message =
        payload && typeof payload.error === 'object' && payload.error && 'message' in payload.error
          ? String((payload.error as { message?: unknown }).message ?? '')
          : `HTTP ${response.status}`;
      return {
        ok: false,
        status: response.status,
        latencyMs,
        message: `共享 Agent 服务异常（${response.status}）。`,
        detail: message,
      };
    }
    return {
      ok: payload?.ok === true,
      status: response.status,
      latencyMs,
      message: payload?.ok === true ? `共享 Agent 可达（HTTP ${response.status}，${latencyMs} ms）。` : '共享 Agent 健康检查未返回有效状态。',
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
}
