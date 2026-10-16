import { database, DatabaseUnavailableError } from '../server/database.mjs';
import { parsePlaceQuery, queryPlaces, QueryValidationError } from '../server/placeQueries.mjs';
import { isTrustedAmapOrigin } from './amap-proxy.mjs';

export function createPlacesHandler(getDatabase = database) {
  return async function handler(req, res) {
    const origin = String(req.headers.origin || '').replace(/\/$/, '');
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (origin && !isTrustedAmapOrigin(origin)) return send(403, { code: 'ORIGIN_DENIED', error: '请求来源不在允许列表内。' });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return send(204);
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); return send(405, { error: '只支持景点查询。' }); }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.search.length > 5000) throw new QueryValidationError('查询条件过长。');
      const filter = parsePlaceQuery(url.searchParams);
      return send(200, await queryPlaces(getDatabase(), filter));
    } catch (error) {
      if (error instanceof QueryValidationError) return send(400, { code: 'INVALID_QUERY', error: error.message });
      if (error instanceof DatabaseUnavailableError) return send(503, { code: error.code, error: error.message });
      return send(503, { code: 'DATABASE_UNAVAILABLE', error: '景点数据库暂时不可用，请稍后再试。' });
    }
  };
}
export default createPlacesHandler();
