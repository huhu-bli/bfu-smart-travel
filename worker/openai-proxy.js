/**
 * 北林智能旅行 · AI 行程助手代理
 *
 * 作用：把浏览器的请求转发给 OpenAI，API Key 只存在于服务端环境变量里。
 * 部署：见同目录 README.md（Cloudflare Workers，免费额度足够个人使用）。
 *
 * 环境变量：
 *   OPENAI_API_KEY  必填，OpenAI 密钥，用 `wrangler secret put` 写入
 *   APP_TOKEN       选填，设置后前端必须带 x-app-token 请求头才能调用
 *   ALLOWED_MODELS  选填，逗号分隔的模型白名单，例如 "gpt-6-astra,gpt-5.6"
 */

const UPSTREAM = 'https://api.openai.com/v1/responses';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-app-token',
  'access-control-max-age': '86400',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return json({ error: { message: '只支持 POST 请求。' } }, 405);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: { message: '服务端没有配置 OPENAI_API_KEY。' } }, 500);
    }

    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) {
      return json({ error: { message: '访问口令不正确。' } }, 401);
    }

    const raw = await request.text();
    if (raw.length > 200_000) {
      return json({ error: { message: '请求体过大。' } }, 413);
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return json({ error: { message: '请求体不是合法 JSON。' } }, 400);
    }

    if (typeof env.ALLOWED_MODELS === 'string' && env.ALLOWED_MODELS.trim()) {
      const allowed = env.ALLOWED_MODELS.split(',').map((item) => item.trim()).filter(Boolean);
      if (allowed.length && !allowed.includes(payload.model)) {
        return json({ error: { message: `模型 ${payload.model} 不在白名单内。` } }, 403);
      }
    }

    // 只允许 Responses API 里我们需要的字段，避免代理被当成通用转发器。
    const body = JSON.stringify({
      model: payload.model,
      instructions: payload.instructions,
      input: payload.input,
      tools: payload.tools,
      tool_choice: payload.tool_choice ?? 'auto',
      parallel_tool_calls: payload.parallel_tool_calls ?? false,
    });

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  },
};
