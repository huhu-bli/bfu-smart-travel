# 景点数据库：数据驱动的旅行查询

## 本次范围与上线状态

景点资料迁移到 PostgreSQL，普通搜索与 Agent 通过同一个只读 API 查询。千问不能执行 SQL，也不能写景点；没有查询结果或数据库不可用时，必须明确告知，不允许用模型记忆或旧数组冒充查询结果。

数据库查询基础版本已通过 PR #17 合并，正式站连接云端 PostgreSQL。2026-10-19 已完成首批资料导入及正式站查询、千问工具调用验证。**迁移到其他部署环境时，仍须先执行迁移和导入，并在 Vercel 配置服务端 `DATABASE_URL`。没有连接串时，接口返回 503。** 维护命令属于后续版本，以实际部署提交为准。

首批导入 86 条记录：北京城市目的地 48 条、北林校园点位 25 条、北交校园点位 13 条（校园入口也属于点位）。这不代表北京所有景点。现有 6 条校外线路模板继续作为模板，不纳入景点表。

## 数据职责

- `database/migrations/`：数据库结构和后续变更，已执行文件不能修改，新增迁移文件。
- `database/seed.ts`：只用于导入旧项目资料，不是线上查询路径；重复执行不会覆盖人工维护内容。
- `server/placeQueries.mjs`：固定 SQL 和参数校验，查询支持关键词、别名、亮点、行政区、兴趣、类别、id 和分页。
- `api/places.mjs`：公开的 GET 查询接口；不接受任意 SQL 或写入请求，不返回连接串。
- `src/lib/placeRepository.ts`：前端和 Agent 共用的数据访问接口。
- `PlaceCatalog.tsx`：不经千问的直接查询界面，支持城市和已导入校园资料。
- `toolExecutor.ts`：校园点位/城市点位查询和路线构建从数据库读取候选。
- `beijingPlanner.ts`：只计算传入的候选，不再自行读取城市静态数组。
- 高德提供交通和地图；天气接口提供预报，两者均不负责充当景点数据库。

旧 TypeScript 点位文件仍保留作首次导入源、单元测试和部分目的地名称识别提示。北京地图、城市编辑候选、城市及校园 Agent 点位工具已查询数据库。**旧的手动校园精细导览仍沿用原资料副本**，后续阶段再迁移这部分展示和门岗注册能力，避免破坏现有校园地图。用户的全局计划、收藏和聊天记录仍保存在浏览器，尚未实现云端账号同步。

## 数据表

| 表 | 内容 |
| --- | --- |
| districts | 16 区的编号、名称、别名 |
| campuses | 高校编号、名称、别名 |
| places | 城市/校园地点，坐标、分类、介绍、停留时间、开放信息、状态、更新时间 |
| tags | 兴趣标签 |
| place_tags | 地点与兴趣的多对多关联 |
| place_sources | 资料来源、核实状态、核实时间 |
| place_revisions | 维护工具记录的版本、操作、维护者和完整资料快照 |
| schema_migrations | 已执行迁移及校验值 |

城市坐标是经纬度；校园示意图坐标保存在独立字段，不能混用。表的约束会拒绝缺失必要坐标或范围信息的地点。`status='archived'` 的地点不再出现在查询结果中；已有浏览器计划是历史快照，不会因此被远程删除。

旧资料统一标为 `project-import / unverified`。迁移成功不等于信息已实地或官方核实。开放时间、预约地址未收录时保存 NULL，界面显示尚未核实。之后补充官方来源及核实日期，才能标记 verified。不要让模型生成景点后直接入库。

## 在 Mac 本地运行

Node.js 建议沿用项目当前的 22 版本。在项目目录执行：

```bash
npm ci
npm run db:setup
```

未配置 `DATABASE_URL` 时，开发脚本使用 PGlite 将 PostgreSQL 数据保存在 `.local-data/places`。该目录已加入 `.gitignore`，不会上传 GitHub。它是开发用的真实 SQL 数据库，不是线上数据库，也不是浏览器 localStorage。不要同时运行两个进程打开同一份本地文件数据库；初始化或导入前先停止 `dev:api`。

一个终端运行：

```bash
npm run dev:api
```

另一个终端运行：

```bash
npm run dev
```

打开 Vite 显示的本地地址，在“景点图鉴 → 景点数据库”查询。请求由 Vite 转发给本地 8787 服务。查询和手动从景点生成路线不需要千问密钥。

可独立检查：

```bash
curl --get http://127.0.0.1:8787/api/places \
  --data-urlencode q=银杏 \
  --data-urlencode district_id=dongcheng \
  --data-urlencode interest=plant
```

预期返回 `source: "database"`、总数和地坛公园资料。服务重启后本地数据仍保留。

## 接入线上 PostgreSQL

1. 准备一套可供 Vercel 连接的 PostgreSQL，并取得连接串。保留服务商要求的 TLS 设置，不关闭证书校验。
2. 在本地新建 `.env.local`，参照 `.env.example` 设置 **`DATABASE_URL`**。连接串包含密码，不上传 Git、不贴到聊天中，也不使用 `VITE_` 前缀。
3. 运行 `npm run db:setup`。脚本检测到连接串后会使用云端 PostgreSQL，创建表并导入首批资料。此步骤会创建新表和添加种子记录，不会清空已有资料；请使用这个项目专用的数据库或分支。
4. 在 Vercel 项目的服务端环境变量中添加 `DATABASE_URL`，对应需要测试的 Preview 和 Production 环境。GitHub Pages 不需要也不能保存数据库密码。
5. 先部署功能分支预览，验证数据库直接搜索和 Agent 工具；确认后再合并 `main`。

后续增加结构用 `npm run db:migrate`；重新导入缺失的原始资料用 `npm run db:seed`。线上请求不会自动执行建表或导入。

建议部署时使用仅有这些表 SELECT 权限的数据库账号，迁移时使用独立维护账号。当前没有公开管理后台；新增、修订、导出、归档和恢复使用[数据库维护命令](place-database-maintenance.md)，不开放匿名写入。

## 查询协议

```text
GET /api/places?scope=city&q=银杏&district_id=dongcheng&interest=plant&limit=20&offset=0
GET /api/places?scope=city&id=forbidden-city
GET /api/places?scope=campus&campus_id=bjtu&q=明湖
```

`district_id`、`interest`、`id` 可重复，其他参数不能重复。标签内部为“任一匹配”，各字段之间为“同时满足”。limit 为 1–100，offset 为 0–100000。百分号和下划线按普通关键词处理，不作为 SQL 通配符。

查询返回 `source`、`total`、`places`、`limit`、`offset`。错误区分 INVALID_QUERY、DATABASE_NOT_CONFIGURED、DATABASE_UNAVAILABLE。数据库故障不会显示成“没有匹配景点”，也不会静默回退到旧静态点位。

### 查询稳定性

只读查询遇到网络异常或 HTTP 502/503/504 时，等待 300 毫秒后最多重试一次，两次尝试共用 12 秒超时预算。400/401/403、成功响应格式错误等不自动重试；持续失败仍显示错误和手动重试按钮。此策略不用于写库或千问请求。

景点搜索保留 250 毫秒输入防抖；切换筛选、分页或离开查询页时取消旧请求，取消后不触发重试，也不覆盖新结果。查询取消与重试只存在于数据访问层和界面生命周期中，不改变数据库结构或路线算法。新增测试覆盖临时失败恢复、重试上限、不应重试的错误、请求中取消和重试等待中取消；共 67 项测试、类型检查、构建通过。

## 扩充与当前限制

数据库新增城市点位后，直接搜索、北京地图和 Agent 路线工具不需要重建前端即可读取。候选查询有分页上限：地图/编辑器最多显示当前筛选的 100 条；路线规划读取最多 200 条候选，并另外补齐明确指定的 id。大规模导入后需再增加按空间距离/相关度排序和地图视野查询，不能把整个数据库一次发给模型。

第一阶段只导入项目已有资料。没有抓取高德全部 POI，也没有新建餐馆库；餐饮字段、价格、具体营业时段和入校规则需要后续整理与核实。数据库提供保存和检索能力，不会自动带来完整或实时的内容。

来源参考：
- node-postgres 参数化查询：https://node-postgres.com/features/queries
- PGlite 开发数据库：https://pglite.dev/docs/
