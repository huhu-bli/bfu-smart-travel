/**
 * 北林智能旅行 · 阿里云函数计算 Node.js Web 函数
 *
 * 运行方式：Node.js 20 / Web 函数 / 自定义运行时
 * 启动命令：node index.mjs
 * 监听端口：9000
 *
 * 环境变量：QWEN_API_KEY（必填）、APP_TOKEN（建议设置）
 */

import http from 'node:http';

const UPSTREAM = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const CHAT_PATH = '/chat/completions';
const ALLOWED_MODELS = new Set(['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus']);
const buckets = new Map();

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-app-token',
  'access-control-max-age': '86400',
};

function sendJson(res, status, body) {
  res.writeHead(status, Object.assign({}, CORS_HEADERS, {
    'content-type': 'application/json; charset=utf-8',
  }));
  res.end(JSON.stringify(body));
}

function sendError(res, message, status) {
  sendJson(res, status || 500, { error: { message } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 200000) {
        reject(new Error('请求体过大。'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown')
    .split(',')[0]
    .trim();
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
  const ip = clientIp(req);
  const ipOk = allowRequest('ip:' + ip, 20, 10 * 60 * 1000);
  const globalOk = allowRequest('global', 200, 60 * 60 * 1000);
  return ipOk && globalOk;
}

async function handle(req, res) {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const path = requestUrl.pathname.replace(/\\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === 'GET' && path === '/') {
    sendJson(res, 200, {
      ok: true,
      service: 'bfu-smart-travel-qwen-proxy-aliyun',
      endpoint: CHAT_PATH,
    });
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, '只支持 GET 健康检查、POST 对话请求或 OPTIONS。', 405);
    return;
  }

  if (path !== CHAT_PATH && path !== '/') {
    sendError(res, '不支持的接口路径，只允许 /chat/completions。', 404);
    return;
  }

  const apiKey = String(process.env.QWEN_API_KEY || '').trim();
  if (!apiKey) {
    sendError(res, '服务端没有配置 QWEN_API_KEY。', 500);
    return;
  }

  const appToken = String(process.env.APP_TOKEN || '').trim();
  if (appToken && req.headers['x-app-token'] !== appToken) {
    sendError(res, '访问口令不正确。', 401);
    return;
  }

  if (!allowedByRateLimit(req)) {
    sendError(res, '请求过于频繁，请稍后再试。', 429);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : '请求体不是合法 JSON。', 400);
    return;
  }

  if (!payload || !Array.isArray(payload.messages) || !payload.messages.length) {
    sendError(res, '请求缺少 messages。', 400);
    return;
  }

  if (!ALLOWED_MODELS.has(payload.model)) {
    sendError(res, '模型不在代理白名单内。', 403);
    return;
  }

  let upstream;
  try {
    upstream = await fetch(UPSTREAM + CHAT_PATH, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        tools: payload.tools,
        tool_choice: payload.tool_choice || 'auto',
        stream: false,
      }),
    });
  } catch (error) {
    sendError(res, '千问上游网络请求失败，请稍后再试。', 502);
    return;
  }

  const text = await upstream.text();
  res.writeHead(upstream.status, Object.assign({}, CORS_HEADERS, {
    'content-type': upstream.headers.get('content-type') || 'application/json',
  }));
  res.end(text);
}

const port = Number(process.env.PORT || process.env.FC_SERVER_PORT || 9000);
const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) sendError(res, '代理服务内部错误。', 500);
    else res.end();
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log('Aliyun Qwen proxy listening on port ' + port);
});
