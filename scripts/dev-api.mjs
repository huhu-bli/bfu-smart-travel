import { createServer } from 'node:http';
import { openScriptDatabase } from './scriptDatabase.mjs';
import { createPlacesHandler } from '../api/places.mjs';

const db = await openScriptDatabase();
const places = createPlacesHandler(() => db);
const server = createServer((req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/api/places') {
    void places(req, res);
  } else { res.statusCode = 404; res.end('Not found'); }
});
server.listen(8787, '127.0.0.1', () => console.log('景点数据库查询服务：http://127.0.0.1:8787/api/places'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(async () => { await db.close(); process.exit(0); }));
