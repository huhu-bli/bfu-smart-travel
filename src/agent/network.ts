import { PROXY_TIMEOUT_MS, REQUEST_TIMEOUT_MS, resolveBase, resolveEndpoint } from './config';
import { describeError, errorDetail, type ProbeResult } from './errors';
import type { AgentSettings } from './types';

/** 向模型发送一次已经构造好的请求。协议和工具循环由上层负责。 */
export async function requestModel(
  settings: AgentSettings,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const endpoint = resolveEndpoint(settings);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.mode === 'direct') {
    headers.authorization = `Bearer ${settings.apiKey.trim()}`;
  } else if (settings.proxyToken.trim()) {
    headers['x-app-token'] = settings.proxyToken.trim();
  }

  const controller = new AbortController();
  const timeout = settings.mode === 'proxy' ? PROXY_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const timer = globalThis.setTimeout(() => controller.abort(), timeout);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    const hint =
      settings.mode === 'direct'
        ? `如果「测试连接」也失败，说明这台设备访问不了 ${resolveBase(settings).replace(/\/+$/, '')}：常见原因是被网络环境拦截、浏览器插件拦截，或需要用代理模式。`
        : '请确认代理已部署成功、地址拼写正确，并且设置了 CORS 响应头。';
    throw new Error(
      settings.mode === 'direct'
        ? `网络请求失败：浏览器没能把请求发出去。${hint}`
        : `网络请求失败：代理地址不可达。${hint}`,
    );
  } finally {
    globalThis.clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(describeError(response.status, payload, settings));
  return payload ?? {};
}

async function probePost(
  base: string,
  path: string,
  model: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; status?: number; detail?: string }> {
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-not-a-real-key-probe',
      },
      body: JSON.stringify({ model: model || 'gpt-5.6', input: 'ping' }),
      signal,
    });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, detail: errorDetail(error) };
  }
}

/** 检查网络、密钥和浏览器是否能发出 POST 请求。 */
export async function probeConnection(settings: AgentSettings): Promise<ProbeResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 15_000);

  try {
    if (settings.mode === 'direct') {
      let base: string;
      try {
        base = resolveBase(settings);
      } catch (error) {
        return { ok: false, latencyMs: 0, message: errorDetail(error) };
      }
      if (!settings.apiKey.trim()) {
        return { ok: false, latencyMs: 0, message: '先填写 API Key 再测试。' };
      }

      let response: Response;
      try {
        response = await fetch(`${base}/models`, {
          headers: { authorization: `Bearer ${settings.apiKey.trim()}` },
          signal: controller.signal,
        });
      } catch (error) {
        return {
          ok: false,
          latencyMs: elapsed(),
          message: `连不上 ${base}：这台设备的网络到不了该地址，直连模式用不了。`,
          detail: errorDetail(error),
        };
      }

      const ms = elapsed();
      const postPath = settings.protocol === 'chat' ? '/chat/completions' : '/responses';
      const post = await probePost(base, postPath, settings.model.trim(), controller.signal);
      if (!post.ok) {
        const keyNote =
          response.status === 401 ? '顺带一提，当前密钥也无效（401）。' : '密钥和网络本身是通的。';
        return {
          ok: false,
          status: response.status,
          latencyMs: ms,
          message: `能连上服务器，但浏览器发不出 POST 请求（接口：${postPath}）。直连模式用不了，请改用代理模式。${keyNote}`,
          detail: post.detail,
        };
      }

      if (response.status === 401) {
        return { ok: false, status: 401, latencyMs: ms, message: '网络与跨域都正常，但 API Key 无效或已过期（401）。' };
      }
      if (response.status === 403) {
        return { ok: false, status: 403, latencyMs: ms, message: '网络是通的，但密钥没有权限（403）。' };
      }
      if (response.status === 404) {
        return {
          ok: true,
          status: 200,
          latencyMs: ms,
          message: `连接正常：服务器可达、也能发出 POST 请求（${ms} ms）。该服务商没有 /models 接口，密钥是否有效需要发一条消息才知道。`,
        };
      }
      if (!response.ok) {
        return { ok: false, status: response.status, latencyMs: ms, message: `能连上服务器，但返回 HTTP ${response.status}。` };
      }

      const payload = (await response.json().catch(() => null)) as { data?: { id?: string }[] } | null;
      const ids = (payload?.data ?? [])
        .map((item) => item?.id)
        .filter((id): id is string => typeof id === 'string');
      const model = settings.model.trim();
      if (model && ids.length && !ids.includes(model)) {
        return {
          ok: true,
          status: 200,
          latencyMs: ms,
          message: `网络与密钥都正常（${ms} ms），但可用模型里没有「${model}」，建议换成 ${ids.slice(0, 3).join(' / ')}。`,
        };
      }
      return {
        ok: true,
        status: 200,
        latencyMs: ms,
        message: '连接正常：密钥有效、浏览器也能发出 POST 请求。',
      };
    }

    const url = settings.proxyUrl.trim();
    if (!url) return { ok: false, latencyMs: 0, message: '先填写代理地址再测试。' };

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
        latencyMs: elapsed(),
        message: `代理地址不可达：${url}`,
        detail: errorDetail(error),
      };
    }

    const ms = elapsed();
    if (response.status === 401) {
      return { ok: false, status: 401, latencyMs: ms, message: '代理可达，但访问口令不正确（401）。' };
    }
    return {
      ok: true,
      status: response.status,
      latencyMs: ms,
      message: `代理可达（HTTP ${response.status}，${ms} ms），并且返回了跨域头。`,
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

