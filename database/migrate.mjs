import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function migrate(db) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = new URL('./migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    await db.query('BEGIN');
    try {
      await db.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      const { rows } = await db.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
      if (rows.length && rows[0].checksum !== checksum) throw new Error('已执行的迁移不能修改，请新增迁移文件。');
      if (!rows.length) {
        await db.exec(sql);
        await db.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
      }
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }
}
