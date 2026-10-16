ALTER TABLE places ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE places ADD COLUMN address text NOT NULL DEFAULT '';
ALTER TABLE places ADD COLUMN ticket_note text NOT NULL DEFAULT '';
ALTER TABLE places ADD COLUMN coordinate_system text NOT NULL DEFAULT 'unknown'
  CHECK (coordinate_system IN ('unknown', 'gcj02'));
ALTER TABLE places ADD CONSTRAINT place_category_by_scope CHECK (
  (scope = 'city' AND category IN ('landmark','heritage','museum','park','university','neighborhood','restaurant'))
  OR (scope = 'campus' AND category IN ('入口','景观','建筑','场馆','科研','绿地','运动','餐饮'))
);
CREATE OR REPLACE FUNCTION update_place_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

-- 维护工具在同一事务中保存地点、标签、来源及完整历史快照。
-- 不设级联删除，保留被误删地点的历史；公开查询接口没有历史/写入入口。
CREATE TABLE place_revisions (
  place_id text NOT NULL,
  version integer NOT NULL,
  action text NOT NULL CHECK (action IN ('baseline','create','update','archive','restore')),
  actor text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL,
  PRIMARY KEY(place_id, version)
);
