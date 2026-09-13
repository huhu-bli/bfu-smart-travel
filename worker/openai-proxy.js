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
 *   IP_LIMIT        选填，单个 IP 在时间窗内允许的请求数，默认 20
 *   IP_WINDOW_MS    选填，单 IP 限流时间窗（毫秒），默认 10 分钟
 *   GLOBAL_LIMIT    选填，全局时间窗内的请求上限，默认 200（兜住额度被刷）
 *   GLOBAL_WINDOW_MS 选填，全局限流时间窗（毫秒），默认 1 小时
 */

var DEFAULT_UPSTREAM = 'https://api.openai.com/v1';
var ALLOWED_PATHS = ['/responses', '/chat/completions'];

/** 简易限流：每个 isolate 维护自己的计数，够挡住脚本刷量。 */
var buckets = new Map();
var MAX_BUCKETS = 5000;

function numberFrom(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function allowRequest(key, limit, windowMs) {
  var now = Date.now();
  if (buckets.size > MAX_BUCKETS) buckets.clear();
  var entry = buckets.get(key);
  if (!entry || now - entry.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function rateLimit(env, ip) {
  var ipLimit = numberFrom(env.IP_LIMIT, 20);
  var ipWindow = numberFrom(env.IP_WINDOW_MS, 600000);
  var globalLimit = numberFrom(env.GLOBAL_LIMIT, 200);
  var globalWindow = numberFrom(env.GLOBAL_WINDOW_MS, 3600000);

  if (!allowRequest('ip:' + ip, ipLimit, ipWindow)) return 'ip';
  if (!allowRequest('global', globalLimit, globalWindow)) return 'global';
  return null;
}

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

    // 只有真正要花额度的请求才计数：前面那些参数错误不该扣用户的配额。
    var ip = request.headers.get('cf-connecting-ip') || 'unknown';
    var limited = rateLimit(env, ip);
    if (limited === 'ip') {
      return errorResponse('你问得有点快，休息一会儿再来吧。', 429);
    }
    if (limited === 'global') {
      return errorResponse('共享额度暂时用完了，晚点再来试试。', 429);
    }

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
