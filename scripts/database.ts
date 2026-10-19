import { openScriptDatabase } from './scriptDatabase.mjs';
import { migrate } from '../database/migrate.mjs';
import { seedPlaces } from '../database/seed';

const command = process.argv[2];
if (!['setup', 'migrate', 'seed'].includes(command)) throw new Error('请选择 setup、migrate 或 seed。');
let db;
try {
  db = await openScriptDatabase();
  if (command !== 'seed') await migrate(db);
  const seeded = command !== 'migrate' ? await seedPlaces(db) : { inserted: 0 };
  const { rows } = await db.query('SELECT scope, count(*)::int AS count FROM places GROUP BY scope ORDER BY scope');
  console.log(JSON.stringify({ database: db.kind, inserted: seeded.inserted, counts: rows }));
} catch {
  console.error('数据库操作失败。请检查连接、权限与迁移状态；不会输出连接密码。');
  process.exitCode = 1;
} finally { if (db) await db.close(); }
