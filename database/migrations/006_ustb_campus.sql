-- 新增校园登记，不修改既有校园或用户维护的资料。
INSERT INTO campuses(id, name, aliases)
VALUES ('ustb', '北京科技大学', ARRAY['北京科技大学', '北科大', '北科', '贝壳', 'USTB'])
ON CONFLICT (id) DO NOTHING;
