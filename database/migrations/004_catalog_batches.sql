-- 只登记已审核、随代码发布的资料批次，不存储数据库凭据。
CREATE TABLE catalog_batches (
  id text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  actor text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
