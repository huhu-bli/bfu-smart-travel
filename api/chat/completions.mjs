const UPSTREAM = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const CHAT_PATH = '/chat/completions';
const ALLOWED_MODELS = new Set(['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus']);
const MAX_BODY_CHARS = 120_000;
const MAX_MESSAGES = 30;
const UPSTREAM_TIMEOUT_MS = 25_000;
const buckets = new Map();

function isTrustedBrowserOrigin(origin) {
  return origin === 'https://huhu-bli.github.io'
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function setHeaders(res, headers = {}, origin = '') {
  const corsHeaders = origin && isTrustedBrowserOrigin(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {};
  Object.entries({ ...corsHeaders, ...headers }).forEach(([name, value]) => {
    res.setHeader(name, value);
  });
}
function sendJson(res, status, body, origin = '') {
  setHeaders(res, { 'Content-Type': 'application/json; charset=utf-8' }, origin);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
function sendError(res, message, status = 500, origin = '') {
  sendJson(res, status, { error: { message } }, origin);
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
}
function allowRequest(key, limit, windowMs) {
  const now = Date.now();
  const old = buckets.get(key);
  if (!old || now - old.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  old.count += 1;
  return old.count <= limit;
}
function allowedByRateLimit(req) {
  return allowRequest('ip:' + clientIp(req), 20, 10 * 60 * 1000) && allowRequest('global', 200, 60 * 60 * 1000);
}
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || '').trim().replace(/\/$/, '');
  if (origin && !isTrustedBrowserOrigin(origin)) {
    return sendError(res, '请求来源不在允许列表内。', 403);
  }
  setHeaders(res, {}, origin);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method === 'GET') {
    const configured = Boolean(String(process.env.QWEN_API_KEY || '').trim());
    return sendJson(
      res,
      configured ? 200 : 503,
      {
        ok: configured,
        service: 'bfu-smart-travel-qwen-proxy-vercel',
        endpoint: CHAT_PATH,
        message: configured ? '代理服务已配置。' : '服务端没有配置 QWEN_API_KEY。',
      },
      origin,
    );
  }
  if (req.method !== 'POST') return sendError(res, '只支持 GET 健康检查、POST 对话请求或 OPTIONS。', 405, origin);

  const apiKey = String(process.env.QWEN_API_KEY || '').trim();
  if (!apiKey) return sendError(res, '服务端没有配置 QWEN_API_KEY。', 500, origin);
  const appToken = String(process.env.APP_TOKEN || '').trim();
  const trustedBrowser = isTrustedBrowserOrigin(origin);
  if (!trustedBrowser && appToken && req.headers['x-app-token'] !== appToken) {
    return sendError(res, '访问口令不正确。', 401, origin);
  }
  if (!allowedByRateLimit(req)) return sendError(res, '请求过于频繁，请稍后再试。', 429, origin);

  let payload;
  try { payload = parseBody(req); } catch { return sendError(res, '请求体不是合法 JSON。', 400, origin); }
  if (!payload || !Array.isArray(payload.messages) || !payload.messages.length) {
    return sendError(res, '请求缺少 messages。', 400, origin);
  }
  if (payload.messages.length > MAX_MESSAGES) {
    return sendError(res, `对话历史不能超过 ${MAX_MESSAGES} 条消息。`, 413, origin);
  }
  if (JSON.stringify(payload).length > MAX_BODY_CHARS) {
    return sendError(res, '请求内容过大，请清空部分历史后重试。', 413, origin);
  }
  if (!ALLOWED_MODELS.has(payload.model)) return sendError(res, '模型不在代理白名单内。', 403, origin);

  let upstream;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    upstream = await fetch(UPSTREAM + CHAT_PATH, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ model: payload.model, messages: payload.messages, tools: payload.tools, tool_choice: payload.tool_choice || 'auto', stream: false }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return sendError(res, '千问上游请求超时，请稍后重试。', 504, origin);
    }
    return sendError(res, '千问上游网络请求失败，请稍后再试。', 502, origin);
  } finally {
    clearTimeout(timer);
  }
  const text = await upstream.text();
  setHeaders(res, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' }, origin);
  res.statusCode = upstream.status;
  return res.end(text);
}
