import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { importPlaces } from '../server/placeMaintenance.mjs';

/** 供本地初始化和生产发布共用；批次锁、校验值和地点写入在同一事务中。 */
export async function applyCampusCatalogs(db) {
  const results = [];
  for (const id of ['ustb-campus-2026-11-01']) {
    const text = await readFile(new URL(`../database/catalogs/${id}.json`, import.meta.url), 'utf8');
    results.push(await importPlaces(db, JSON.parse(text), { apply: true, actor: `campus:${id}`,
      batch: { id, checksum: createHash('sha256').update(text).digest('hex') } }));
  }
  return results;
}
