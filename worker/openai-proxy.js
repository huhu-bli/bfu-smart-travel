/**
 * 北林智能旅行 · 通义千问 Cloudflare Worker 代理
 *
 * 浏览器只请求本 Worker，QWEN_API_KEY 永远保存在 Cloudflare secret 中。
 * Worker 不提供通用上游转发，只允许通义千问 Chat Completions 接口。
 *
 * Secrets:
 *   QWEN_API_KEY  必填，通义千问 API Key
 *   APP_TOKEN      选填，设置后前端必须带 x-app-token
 *
 * 可选变量：
 *   ALLOWED_MODELS    逗号分隔的模型白名单
 *   IP_LIMIT          单 IP 时间窗请求数，默认 20
 *   IP_WINDOW_MS      单 IP 时间窗，默认 10 分钟
 *   GLOBAL_LIMIT      全局时间窗请求数，默认 200
 *   GLOBAL_WINDOW_MS  全局时间窗，默认 1 小时
 */

var DEFAULT_UPSTREAM = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
var CHAT_PATH = '/chat/completions';
var DEFAULT_MODELS = ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus'];

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
  'access-control-allow-methods': 'GET, POST, OPTIONS',
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

function allowedModels(env) {
  var source = typeof env.ALLOWED_MODELS === 'string' && env.ALLOWED_MODELS.trim()
    ? env.ALLOWED_MODELS
    : DEFAULT_MODELS.join(',');
  return source.split(',').map(function (item) { return item.trim(); }).filter(Boolean);
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === 'GET' && path === '/') {
      return json({
        ok: true,
        service: 'bfu-smart-travel-qwen-proxy',
        endpoint: CHAT_PATH,
      });
    }

    if (request.method !== 'POST') {
      return errorResponse('只支持 GET 健康检查、POST 对话请求或 OPTIONS。', 405);
    }

    if (path !== CHAT_PATH) {
      return errorResponse('不支持的接口路径，只允许 /chat/completions。', 404);
    }

    if (!env.QWEN_API_KEY) {
      return errorResponse('服务端没有配置 QWEN_API_KEY。', 500);
    }

    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) {
      return errorResponse('访问口令不正确。', 401);
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

    if (!payload || !Array.isArray(payload.messages) || !payload.messages.length) {
      return errorResponse('请求缺少 messages。', 400);
    }

    var models = allowedModels(env);
    if (models.indexOf(payload.model) === -1) {
      return errorResponse('模型不在 Worker 白名单内。', 403);
    }

    var ip = request.headers.get('cf-connecting-ip') || 'unknown';
    var limited = rateLimit(env, ip);
    if (limited === 'ip') {
      return errorResponse('你问得有点快，休息一会儿再来吧。', 429);
    }
    if (limited === 'global') {
      return errorResponse('共享额度暂时用完了，晚点再来试试。', 429);
    }

    var body = JSON.stringify({
      model: payload.model,
      messages: payload.messages,
      tools: payload.tools,
      tool_choice: payload.tool_choice || 'auto',
      stream: false,
    });

    var upstream = await fetch(DEFAULT_UPSTREAM + CHAT_PATH, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.QWEN_API_KEY,
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
