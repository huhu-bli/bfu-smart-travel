/**
 * 北林智能旅行 · AI 行程助手代理
 *
 * 作用：把浏览器的请求转发给模型服务商，API Key 只存在于服务端环境变量里，
 *       这样访客打开网页就能直接用 AI，不需要自己填密钥。
 *
 * 环境变量：
 *   OPENAI_API_KEY  必填，服务商的密钥（DeepSeek / 通义百炼 / OpenAI 等）
 *   UPSTREAM_BASE   选填，上游基地址，默认 https://api.openai.com/v1
 *                   DeepSeek 填 https://api.deepseek.com
 *                   通义百炼 填 https://dashscope.aliyuncs.com/compatible-mode/v1
 *   APP_TOKEN       选填，设置后前端必须带 x-app-token 请求头才能调用
 *   ALLOWED_MODELS  选填，逗号分隔的模型白名单
 */

var DEFAULT_UPSTREAM = 'https://api.openai.com/v1';
var ALLOWED_PATHS = ['/responses', '/chat/completions'];

var CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-app-token',
  'access-control-max-age': '86400',
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, CORS_HEADERS, {
      'content-type': 'application/json; charset=utf-8',
    }),
  });
}

function errorResponse(message, status) {
  return json({ error: { message: message } }, status);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return errorResponse('只支持 POST 请求。', 405);
    }

    if (!env.OPENAI_API_KEY) {
      return errorResponse('服务端没有配置 OPENAI_API_KEY。', 500);
    }

    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) {
      return errorResponse('访问口令不正确。', 401);
    }

    var path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (ALLOWED_PATHS.indexOf(path) === -1) {
      return errorResponse('不支持的接口路径 ' + path + '，只允许 /responses 或 /chat/completions。', 404);
    }

    var raw = await request.text();
    if (raw.length > 200000) {
      return errorResponse('请求体过大。', 413);
    }

    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      return errorResponse('请求体不是合法 JSON。', 400);
    }

    if (typeof env.ALLOWED_MODELS === 'string' && env.ALLOWED_MODELS.trim()) {
      var allowed = env.ALLOWED_MODELS.split(',').map(function (item) { return item.trim(); }).filter(Boolean);
      if (allowed.length && allowed.indexOf(payload.model) === -1) {
        return errorResponse('模型 ' + payload.model + ' 不在白名单内。', 403);
      }
    }

    // 只转发我们需要的字段，避免代理被当成通用转发器。
    var body;
    if (path === '/responses') {
      body = JSON.stringify({
        model: payload.model,
        instructions: payload.instructions,
        input: payload.input,
        tools: payload.tools,
        tool_choice: payload.tool_choice || 'auto',
        parallel_tool_calls: payload.parallel_tool_calls || false,
      });
    } else {
      body = JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        tools: payload.tools,
        tool_choice: payload.tool_choice || 'auto',
        stream: false,
      });
    }

    var upstreamBase = (env.UPSTREAM_BASE || DEFAULT_UPSTREAM).replace(/\/+$/, '');
    var upstream = await fetch(upstreamBase + path, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.OPENAI_API_KEY,
        'content-type': 'application/json',
      },
      body: body,
    });

    var text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: Object.assign({}, CORS_HEADERS, {
        'content-type': upstream.headers.get('content-type') || 'application/json',
      }),
    });
  },
};
