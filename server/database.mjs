import pg from 'pg';

let pool;
export class DatabaseUnavailableError extends Error {
  constructor(code = 'DATABASE_UNAVAILABLE') {
    super(code === 'DATABASE_NOT_CONFIGURED' ? '景点数据库尚未连接，请先完成服务端数据库配置。' : '景点数据库暂时不可用，请稍后再试。');
    this.code = code;
  }
}

export function database() {
  if (!process.env.DATABASE_URL?.trim()) throw new DatabaseUnavailableError('DATABASE_NOT_CONFIGURED');
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      statement_timeout: 7000,
      allowExitOnIdle: true,
    });
    // 不输出连接串或包含密码的错误详情。
    pool.on('error', () => {});
  }
  return pool;
}
