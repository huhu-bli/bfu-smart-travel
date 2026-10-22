# 景点数据库维护

本阶段补齐维护工具，不新建管理网页，不开放匿名写入。保持原有“页面/Agent → 数据访问接口 → 数据库”的架构。千问只能查询、选择和解释地点，不能写 SQL 或导入自己生成的景点。

## 更新与检查

在 Mac 上进入实际项目目录；先停止占用本地 PGlite 的 `dev:api`，再执行：

```bash
cd ~/work/bfu-smart-travel
npm ci
npm run db:setup
npm run db:check
```

`db:setup` 包含迁移和种子导入，可以重复执行；不会覆盖已维护资料。已有数据库也可只执行 `npm run db:migrate`。迁移新增版本号、地址、票价说明、坐标系标记和 `place_revisions` 历史表。不要修改已执行的迁移文件。

没有 `DATABASE_URL` 时，仍使用本地 `.local-data/places`；设置该变量后，所有维护命令直接作用于对应 PostgreSQL。执行前确认目标环境。连接密码只保存在 `.env.local` 或服务端环境变量。

`db:check` 输出有效/归档总数、未收录地址与开放说明数量、未明确坐标系的城市点数量、没有已核实来源的数量、同一范围内的疑似重名。缺失不等于错误，重名也不直接合并；由维护者核对。

## 2026-10-22 官方资料核对批次

`database/catalogs/beijing-reviewed-2026-10-22.json` 更新 22 个现有地点，不新增虚构景点。19 个地点补充开放时间、地址、官方票务与参观说明；13 个地点补充或修正参考坐标。两组有重叠。详细官方页面、核对字段、Wikidata CC0 坐标原始声明及坐标精度保存在同名 `provenance.json`。

开放时间区分季节、停止入园时间、园中园和全园、固定闭馆日以及当前临时安排。首都博物馆收录 2026-10-19 至 23 日临时闭馆和恢复后周二闭馆的公告。北京城市图书馆潞云筑采用 2026-09-01 后的 09:00–21:00，不能沿用旧的全天开放安排。具体票价未可靠读取时明确保留未知，不把免预约等同于免费。`verified` 仅表示对应官方网页已核对，原始项目介绍和参考坐标来源仍标记待核实，不代表实地核验。

坐标从记录中的 WGS84 原值通过已有转换器转为 GCJ-02，供高德显示地点参考位置；不能当作步行入口。颐和园与北京大运河博物馆的旧参考点得到校正。校园仍使用示意坐标，不混用经纬度。

Vercel 的生产构建在类型检查、前端编译成功后执行 `npm run db:apply-reviewed`，使用现有服务端 `DATABASE_URL`，先执行迁移再应用明确列出的审核批次。预览部署、Pages 与普通本地构建不连接数据库；生产环境缺少连接配置或遇到版本冲突会停止发布，不会回退到本地库。公开查询 API 保持只读。生产构建的服务端连接需具备执行迁移与维护批次的权限，不要把它设置为前端变量。

迁移 `004_catalog_batches.sql` 登记批次编号和内容 SHA-256。登记、地点变更及历史处于同一事务中，失败整批回滚。并发发布串行检查，重复发布跳过已执行批次，不覆盖后续人工维护。已执行 JSON 不再修改；后续资料变化需导出当前版本并新增审核批次，再显式加入脚本列表。历史版本仍可用 `db:history` 检查。

以原始 86 条加常用景点 19 条的数据集验收：总数保持 105，城市 67；本批后城市有 19 条开放说明、19 条含已核对官方来源、35 条坐标系仍未知。尚未解决其余地点逐条核实、真实餐馆、远郊覆盖及数据库平台备份与恢复演练；不能把本批发布视为数据库已全部完善。

## 修改已有地点

例如先导出故宫：

```bash
npm run db:export -- ./forbidden-city-edit.json --id forbidden-city
```

编辑生成的 JSON，保留 `operation: "update"`、原有 `id`、`expectedVersion` 和其他资料，只修改需修订的内容。**每条记录是完整替换，不是局部补丁**，删除可选字段会清空相应内容。先校验，再连接数据库预览：

```bash
npm run db:validate -- ./forbidden-city-edit.json
npm run db:import -- ./forbidden-city-edit.json
```

格式校验不连接数据库；预览会执行真正的 SQL、版本与外键校验，然后全部回滚，地点、标签、来源和历史都不保存。确认预览的地点编号、操作和目标版本后保存：

```bash
npm run db:import -- ./forbidden-city-edit.json --apply --actor huhu
npm run db:history -- forbidden-city
```

如果提示版本冲突，重新导出，核对他人的修改后再编辑，不要直接把版本号改大。导入文件内全部成功才会提交；任意一条失败则整批回滚。重复导入完全未变化且版本仍匹配的记录不会新增版本。

不带 `--id` 可导出全部有效地点，单文件最多 200 条；超过时按 id 导出。导出文件已存在时拒绝覆盖。导出只用于编辑，**不含归档与历史，不代替 PostgreSQL 的备份**。

## 添加新地点

复制一条同范围的导出记录，在 `places` 数组里添加它，改成 `operation: "create"`、新的稳定 id，删除 `expectedVersion`；替换名称、坐标、资料和来源等全部字段。也可以在新文件中仅保留这一条记录。根结构保持：

```json
{
  "schemaVersion": 1,
  "places": []
}
```

空数组不能导入；填入完整记录后再运行上述校验、预览和保存命令。每文件 1–200 条、最大 2 MB。id 使用小写字母、数字和短横线；新建不能覆盖已有 id，更新不能偷偷创建新地点。已有 id 不可改成另一个范围或另一所学校。

| 内容 | 规则 |
| --- | --- |
| 城市地点 | `scope: "city"`、已登记的 `districtId`、数值型 `lng/lat`，不能带校园坐标 |
| 校园地点 | `scope: "campus"`、已登记的 `campusId`、数值型 `x/y`，不能带城市经纬度 |
| 城市类别 | landmark / heritage / museum / park / university / neighborhood / restaurant |
| 校园类别 | 入口 / 景观 / 建筑 / 场馆 / 科研 / 绿地 / 运动 / 餐饮 |
| 兴趣 | plant / culture / research / sport / food / photo；数组内不能重复 |
| 坐标系 | 城市使用 `gcj02` 或 `unknown`；未知不能谎称已转换，高德使用的坐标须先人工确认 |
| 开放信息 | `openingHours` 文本或 null；不能凭空推断营业时间 |
| 预约信息 | `bookingUrl` 为 HTTPS 链接或 null，不能含账号密码 |
| 地址、票价 | `address`、`ticketNote` 为说明文本，缺失保留空文本 |
| 资料来源 | 1–10 条；kind 为 project-import / official / manual；reference 不重复 |
| 核实状态 | 默认 unverified；verified 必须填写真实且不晚于今天的 YYYY-MM-DD `verifiedAt` |

`official` 来源必须提供 HTTPS 链接，但程序不会因为链接格式正确就证明它属于官方；维护者仍须检查内容和实际来源。source 的 `verificationStatus` 标记该来源，不代表整条地点资料永不过期。餐饮类别现在可以查询和参与规划，但尚未导入真实餐馆资料。

## 归档与恢复

先查询历史，获取 `currentVersion`：

```bash
npm run db:history -- forbidden-city
```

假设当前版本是 2，先预览归档，再保存：

```bash
npm run db:archive -- forbidden-city --version 2
npm run db:archive -- forbidden-city --version 2 --apply --actor huhu
```

归档后版本会变成 3，直接查询和 Agent 工具不再返回该地点。恢复同样先预览：

```bash
npm run db:restore -- forbidden-city --version 3
npm run db:restore -- forbidden-city --version 3 --apply --actor huhu
```

这里的版本号是示例，必须使用实际最新值。维护工具不提供物理删除；浏览器中保存的已有路线属于历史快照，不会被归档操作自动删除。页面已加载的列表需重新查询才刷新。

## 历史与权限边界

维护工具在同一事务中保存地点、标签、来源和历史快照。旧种子首次修改前保留 baseline；后续记录 create/update/archive/restore、版本、维护者和时间，可检查当时完整资料。维护者名称是操作备注，不是登录认证。

直接在数据库控制台执行 SQL 会触发地点版本递增，**但不会自动生成维护工具的完整历史快照**。日常维护请使用这些命令；数据库管理员的手工操作需依赖数据库自身审计和备份。此阶段未提供任意历史版本自动回滚，可从历史核对资料后以当前版本重新修订。

公开 `/api/places` 仍只读。建议线上查询使用 SELECT 权限账号，维护工具用独立维护账号。数据库查询基础版本已通过 PR #17 上线；维护工具属于后续版本，是否可用须以已部署提交为准。使用维护命令前确认目标数据库已执行 `003_place_maintenance.sql`，并按 [数据库接入说明](place-database.md) 验证预览；已有云端数据库无需重新创建。
