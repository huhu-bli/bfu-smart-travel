/**
 * 北林智能旅行 · AI 行程助手代理
 *
 * 作用：把浏览器的请求转发给 OpenAI，API Key 只存在于服务端环境变量里。
 * 部署：见同目录 README.md（Cloudflare Workers，免费额度足够个人使用）。
 *
 * 环境变量：
 *   OPENAI_API_KEY  必填，服务商的密钥（DeepSeek / OpenAI 等），用 `wrangler secret put` 写入
 *   UPSTREAM_BASE   选填，上游基地址，默认 https://api.openai.com/v1；
 *                   用 DeepSeek 就填 https://api.deepseek.com
 *   APP_TOKEN       选填，设置后前端必须带 x-app-token 请求头才能调用
 *   ALLOWED_MODELS  选填，逗号分隔的模型白名单，例如 "deepseek-chat,gpt-5.6"
 */

const DEFAULT_UPSTREAM = 'https://api.openai.com/v1';
/** 允许转发的接口路径：Responses 与 Chat Completions 各一个。 */
const ALLOWED_PATHS = ['/responses', '/chat/completions'];

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

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (!ALLOWED_PATHS.includes(path)) {
      return json(
        { error: { message: `不支持的接口路径 ${path}，只允许 ${ALLOWED_PATHS.join(' 或 ')}。` } },
        404,
      );
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

    // 只转发我们需要的字段，避免代理被当成通用转发器。
    const upstreamBase = (env.UPSTREAM_BASE || DEFAULT_UPSTREAM).replace(/\/+$/, '');
    const body =
      path === '/responses'
        ? JSON.stringify({
            model: payload.model,
            instructions: payload.instructions,
            input: payload.input,
            tools: payload.tools,
            tool_choice: payload.tool_choice ?? 'auto',
            parallel_tool_calls: payload.parallel_tool_calls ?? false,
          })
        : JSON.stringify({
            model: payload.model,
            messages: payload.messages,
            tools: payload.tools,
            tool_choice: payload.tool_choice ?? 'auto',
            stream: false,
          });

    const upstream = await fetch(`${upstreamBase}${path}`, {
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
