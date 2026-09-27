const UPSTREAM = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const CHAT_PATH = '/chat/completions';
const ALLOWED_MODELS = new Set(['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus']);
const buckets = new Map();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
  'Access-Control-Max-Age': '86400',
};

function sendJson(res, status, body) {
  res.status(status).set(CORS_HEADERS).json(body);
}
function sendError(res, message, status = 500) {
  sendJson(res, status, { error: { message } });
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
  res.set(CORS_HEADERS);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'bfu-smart-travel-qwen-proxy-vercel', endpoint: CHAT_PATH });
  }
  if (req.method !== 'POST') return sendError(res, '只支持 GET 健康检查、POST 对话请求或 OPTIONS。', 405);

  const apiKey = String(process.env.QWEN_API_KEY || '').trim();
  if (!apiKey) return sendError(res, '服务端没有配置 QWEN_API_KEY。', 500);
  const appToken = String(process.env.APP_TOKEN || '').trim();
  if (appToken && req.headers['x-app-token'] !== appToken) return sendError(res, '访问口令不正确。', 401);
  if (!allowedByRateLimit(req)) return sendError(res, '请求过于频繁，请稍后再试。', 429);

  let payload;
  try { payload = parseBody(req); } catch { return sendError(res, '请求体不是合法 JSON。', 400); }
  if (!payload || !Array.isArray(payload.messages) || !payload.messages.length) return sendError(res, '请求缺少 messages。', 400);
  if (!ALLOWED_MODELS.has(payload.model)) return sendError(res, '模型不在代理白名单内。', 403);

  let upstream;
  try {
    upstream = await fetch(UPSTREAM + CHAT_PATH, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ model: payload.model, messages: payload.messages, tools: payload.tools, tool_choice: payload.tool_choice || 'auto', stream: false }),
    });
  } catch {
    return sendError(res, '千问上游网络请求失败，请稍后再试。', 502);
  }
  const text = await upstream.text();
  return res.status(upstream.status).set({ ...CORS_HEADERS, 'Content-Type': upstream.headers.get('content-type') || 'application/json' }).send(text);
}
