import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { migrate } from '../database/migrate.mjs';
import { importPlaces } from '../server/placeMaintenance.mjs';
import { openScriptDatabase } from './scriptDatabase.mjs';

const batches = ['beijing-reviewed-2026-10-22', 'beijing-ticket-prices-2026-10-23'];

export async function applyReviewedCatalogs({ env = process.env, connect = openScriptDatabase } = {}) {
  // 预览分支、GitHub Pages 和本地构建绝不写生产库。
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') return { skipped: true };
  if (!env.DATABASE_URL?.trim()) throw new Error('生产资料发布缺少 DATABASE_URL，已停止发布。');
  const db = await connect();
  try {
    await migrate(db);
    const results = [];
    for (const id of batches) {
      const text = await readFile(new URL(`../database/catalogs/${id}.json`, import.meta.url), 'utf8');
      results.push(await importPlaces(db, JSON.parse(text), { apply: true, actor: `reviewed:${id}`,
        batch: { id, checksum: createHash('sha256').update(text).digest('hex') } }));
    }
    return { skipped: false, results };
  } finally { await db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  applyReviewedCatalogs().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    // 不输出连接串、PG 错误上下文或其他环境变量。
    console.error(error.name === 'PlaceValidationError' ? error.message : '资料批次发布失败，请检查数据库连接和迁移状态。');
    process.exitCode = 1;
  });
}
