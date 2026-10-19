import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function openScriptDatabase() {
  try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (process.env.DATABASE_URL?.trim()) {
    const { Client } = (await import('pg')).default;
    const client = new Client({ connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    await client.connect();
    return { query: client.query.bind(client), exec: (sql) => client.query(sql), close: () => client.end(), kind: 'postgresql' };
  }
  if (process.env.VERCEL) throw new Error('云端必须配置 DATABASE_URL，不能使用本地文件保存数据库。');
  const { PGlite } = await import('@electric-sql/pglite');
  const path = resolve('.local-data/places');
  await mkdir(path, { recursive: true });
  const db = new PGlite(path);
  await db.waitReady;
  db.kind = 'local-postgresql';
  return db;
}
