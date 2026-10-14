const TRUSTED_ORIGINS = new Set([
  'https://huhu-bli.github.io',
  'https://bfu-smart-travel.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const PREVIEW_ORIGIN = /^https:\/\/bfu-smart-travel-(?:git-)?[a-z0-9-]+-h2642341596-4653\.vercel\.app$/i;
const ALLOWED_PATH = /^v(?:3\/(?:place|direction)\/[a-z0-9/_-]+|4\/map\/styles(?:\/[a-z0-9/_-]+)?|5\/direction\/[a-z0-9/_-]+)$/i;
const LIMIT_PER_MINUTE = 120;
const MAX_QUERY_LENGTH = 2400;
const buckets = new Map();

export function isTrustedAmapOrigin(origin) {
  return TRUSTED_ORIGINS.has(origin) || PREVIEW_ORIGIN.test(origin);
}

function requestOrigin(req) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (origin) return origin;
  try { return new URL(String(req.headers.referer || '')).origin; } catch { return '' ; }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: body }));
}

function rateLimited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0];
  const now = Date.now();
  const previous = buckets.get(ip);
  if (!previous || now - previous.start >= 60_000) {
    buckets.set(ip, { start: now, count: 1 });
    return false;
  }
  previous.count += 1;
  return previous.count > LIMIT_PER_MINUTE;
}

export default async function handler(req, res) {
  const origin = requestOrigin(req);
  if (!isTrustedAmapOrigin(origin)) return send(res, 403, '请求来源不在允许列表内。');
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') return send(res, 405, '只支持 GET 请求。');

  const securityCode = String(process.env.AMAP_SECURITY_CODE || '').trim();
  if (!securityCode) return send(res, 503, '高德地图代理尚未配置。');
  if (rateLimited(req)) return send(res, 429, '高德地图请求过于频繁。');

  const url = new URL(req.url, 'https://bfu-smart-travel.vercel.app');
  const path = String(req.query?.amap_path ?? url.searchParams.get('amap_path') ?? '');
  if (path.length > 150 || !ALLOWED_PATH.test(path) || url.search.length > MAX_QUERY_LENGTH) {
    return send(res, 400, '不支持该地图服务路径。');
  }
  const host = path.startsWith('v4/map/styles') ? 'webapi.amap.com' : 'restapi.amap.com';
  const upstreamUrl = new URL(`https://${host}/${path}`);
  for (const [name, value] of url.searchParams) {
    if (name !== 'amap_path' && name !== 'jscode') upstreamUrl.searchParams.append(name, value);
  }
  upstreamUrl.searchParams.set('jscode', securityCode);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(9000),
    });
    res.statusCode = response.status;
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    return send(res, 502, '高德地图上游暂时不可用。');
  }
}
