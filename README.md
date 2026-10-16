# 北京智能旅行 · Beijing Smart Travel

> 数据库功能分支：景点查询已接入 PostgreSQL，新增普通数据库搜索页。上线前须配置服务端 DATABASE_URL 并初始化数据，详见 [景点数据库说明](docs/place-database.md)。本地可先运行 npm run db:setup 和 npm run dev:api。


面向北京市 16 个行政区景点、高校、博物馆、公园与街区的智能路线规划器。城市级路线与校园精细路线使用两套独立算法、统一进入全局计划；北京林业大学、北京交通大学继续保留独立校内点位，绝不跨校复用路线。

前端是 React + Vite + TypeScript，静态页面托管在 GitHub Pages；千问请求通过 Vercel Serverless Function 转发，API Key 不进入浏览器。

高德地图使用 Web 端 JS API Key。高德安全密钥仅保存在 Vercel 的 `AMAP_SECURITY_CODE` 环境变量中，`/_AMapService/*` 请求由 Vercel 函数代理；GitHub Pages 构建只注入公开的 `AMAP_JS_KEY` 和代理地址。Vercel 部署另需 `VITE_AMAP_KEY`，Preview 和 Production 环境都要配置。修改变量后分别重新部署对应站点。

## 功能

| 模块 | 说明 |
| --- | --- |
| 北京智能路线 | 按行政区、兴趣、可用时长和交通偏好生成跨区或单区路线；配置高德后返回真实步行/公交时间与道路轨迹，失败时自动回退估算 |
| 校园智能路线 | 按兴趣标签、可用时长、步速节奏与出发门岗，自动挑选并排序校内点位 |
| 校园地图 | **真实矢量地图**：用 OpenStreetMap 的校园边界、建筑轮廓、道路与绿地渲染成 SVG，路线高亮带绘制动画，点击任意点位查看讲解 |
| 北京综合地图 | 展示覆盖 16 区的确定性基础点位，支持行政区、类别和关键词筛选，并高亮当前全局路线 |
| 点位图鉴 | 22 个校园点位（校门、教学楼、图书馆、食堂、体育场、林之心、雨水花园等），支持关键词搜索、兴趣筛选、收藏（保存在浏览器本地） |
| 周边一日游 | 奥森、圆明园、颐和园、香山、鹫峰实验林场、五道口 6 条线路，含时间轴、预算、交通与提示 |
| 出行清单 | 五大类打包清单，勾选进度自动保存到 `localStorage` |
| AI 行程助手 | 用自然语言生成北京或校园路线，生成后自动写入全局计划并支持后续增删；网络不可达时由**内置助手**调用同一工具层兜底 |

## 快速开始

```bash
npm install
npm run dev      # 本地开发，默认 http://localhost:5173
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
npm run typecheck # TypeScript 类型检查
```

## AI 行程助手（Agent）

右下角的小机器人就是入口。它用「模型 + 工具调用」的方式接到本项目已有的数据和算法上：模型负责理解需求、选参数，路线和点位内容全部由本地函数产出，不会出现模型编造点位或时间的情况。

### 当前 Agent 配置

项目只保留通义千问 Chat Completions：

| 项目 | 当前配置 |
| --- | --- |
| 模型 | `qwen3.8-flash` |
| 前端部署 | GitHub Pages |
| API 代理 | Vercel Serverless Function |
| 千问 API Key | 仅保存在 Vercel 环境变量 `QWEN_API_KEY` |
| 访问口令 | 仅保存在 Vercel 环境变量 `APP_TOKEN`，不注入前端 |

用户不需要在浏览器中填写 API Key，也不应把 Key 写入仓库、截图或 `localStorage`。

### 连不上怎么办

设置面板里有「测试连接」按钮，它打一次不产生生成费用的请求，直接把问题定位到具体环节：

| 提示 | 含义 | 处理 |
| --- | --- | --- |
| 代理服务不可达 | 当前设备无法访问 Vercel API | 换网络，或检查 Vercel 域名和部署状态 |
| 服务端没有配置 `QWEN_API_KEY` | Vercel 环境变量缺失 | 在 Vercel Production 环境添加并重新部署 |
| 共享 Agent 返回 401 | 访问口令或部署版本不一致 | 检查 Vercel `APP_TOKEN`，确认前端指向正确部署 |
| 返回 429 | 触发限流或额度不足 | 稍后重试并检查百炼用量 |

网络到不了 Vercel 代理时，浏览器可能只会报一个笼统的「网络请求失败」，所以先点测试连接再排查，能省很多时间。

连接测试会检查 Vercel 代理的健康状态；健康不代表千问一定有额度，正式请求仍会显示具体的 401、429 或 5xx 原因。

### 暴露给模型的工具

| 工具 | 作用 | 对应的本地实现 |
| --- | --- | --- |
| `list_spots` | 按兴趣或关键词查点位、拿点位 id | `src/data/spots.ts` |
| `build_route` | 生成路线，返回有序站点与时间 | `src/lib/planner.ts` 的 `buildRoute()` |
| `get_spot_detail` | 取某点位的讲解、亮点、最佳时段、贴士 | `src/data/spots.ts` |
| `list_beijing_places` | 按行政区、兴趣或关键词查询北京点位 | `src/data/beijingPlaces.ts` |
| `build_beijing_route` | 生成可进入全局计划的北京城市路线 | `src/lib/beijingPlanner.ts` + `src/lib/routeProviders/amap.ts` |
| `get_beijing_place_detail` | 获取北京城市点位详情 | `src/data/beijingPlaces.ts` |
| `get_weather` | 查询目的地天气 | `src/lib/weather.ts` |

模型返回工具调用后，前端执行本地函数，把结果作为 `function_call_output` 回传，再拿最终回复——就是官方文档里的标准五步循环。工具使用 `strict: true`，并要求 `additionalProperties: false`、所有字段都出现在 `required` 里；同时设了 `parallel_tool_calls: false`，避免一次并发调用多个工具。

模型白名单由服务端维护，默认使用 `qwen3.8-flash`。

## 让别人也能用

## 手机端

- **响应式布局**：导航变成可横滑的胶囊条，规划器 / 地图 / 卡片在窄屏自动变单列。
- **地图为小屏专门调过**：SVG 在手机上会被缩到约 1/3，所以 ≤720px 时把标签字号、点位半径和点击热区按比例放大了（实测 390px 宽下标签约 10.7px、点位点击半径约 16px，不再"看不清也点不中"）。
- **PWA**：手机浏览器里可以「添加到主屏幕」，打开后全屏运行、没有地址栏，和原生应用差不多。图标是脚本生成的 PNG（192 / 512 / 180 三档，含 maskable 版本）。
- **离线可用**：Service Worker 缓存页面与静态资源（导航请求「网络优先、失败回退缓存」，避免看到旧版本），校园里信号不稳也能翻点位、看地图；AI 对话需要联网。
- 页面不会禁用缩放，需要看地图细节时可以双指放大。

### 默认：内置助手，零配置可用

### 对话上下文与保存策略

| 项目 | 现状 |
| --- | --- |
| 发给模型的历史 | **只带最近 10 轮**（按「用户提问」为边界裁剪，工具调用与结果不会被拆散），再按 60KB 体积兜底裁一次 |
| 实测请求体积 | 第 1 轮约 3.5KB，第 11 轮封顶约 **12KB**，之后不再增长（25 轮仍是 12KB） |
| 不裁剪的后果 | 每轮约 +900B，约 220 轮就会撞上代理的 200KB 请求上限并报错——所以必须裁 |
| 聊天记录保存 | 存在浏览器 `localStorage`（只保留最近 30 条显示消息），**刷新页面 / 关掉再打开还能接着聊**；点「清空对话」即删除 |
| 不保存的内容 | 密钥不会写进聊天记录；切换服务商时上下文会重置（两套协议的历史格式不通用） |

网站是纯静态的，任何人打开都能直接用：路线规划、地图、图鉴、周边线路、出行清单一律不需要账号或密钥。

AI 助手在没有配置密钥时会自动切到**内置助手**：用规则解析中文问题，然后调用和 AI 完全相同的那四个工具函数。所以下面这些它都能答，且不联网、不消耗任何额度：

- 「我只有 1 小时，从东门进，怎么逛最值」
- 「银杏大道值得专门去一趟吗」
- 「一天想逛故宫、天坛和什刹海」

### 让所有访客使用千问 Agent：Vercel 代理

1. 在 Vercel 导入仓库，根目录保持为仓库根目录。
2. 在 Vercel Production 环境添加 `QWEN_API_KEY` 和 `APP_TOKEN`。
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 添加 `AGENT_PROXY_URL`，值为 Vercel 的 `/api` 地址。
4. 重新运行 GitHub Pages 工作流。

只有代理地址会进入前端；`QWEN_API_KEY` 和 `APP_TOKEN` 不进入构建产物。

## 部署到 GitHub Pages

仓库里已经包含 `.github/workflows/deploy.yml`，推送到 `main` 分支后自动构建并发布。

首次启用：进入仓库 **Settings → Pages**，把 **Source** 设为 **GitHub Actions**，然后在 **Actions** 里等待 `Deploy to GitHub Pages` 跑完，页面地址形如 `https://<用户名>.github.io/bfu-smart-travel/`。

Vite 的 `base` 已设置为 `./`，所以放在任意子路径下都能正常加载。

## 目录结构

```
bfu-smart-travel/
├─ .github/workflows/deploy.yml   # GitHub Pages 自动部署
├─ public/favicon.svg
├─ src/
│  ├─ App.tsx                     # 页面框架与状态管理
│  ├─ components/                 # 导航、规划器、路线结果、地图、图鉴、周边、清单
│  ├─ data/
│  │  ├─ spots.ts                 # 校园点位数据（22 个，坐标为真实经纬度投影）
│  │  ├─ campusGeometry.ts        # 校园矢量地图（边界/建筑/道路/绿地，来源 OSM）
│  │  ├─ beijingPlaces.ts         # 北京 16 区城市路线基础点位
│  │  ├─ trips.ts                 # 路线灵感数据
│  │  └─ interests.ts             # 兴趣标签、时长、步速、门岗
│  ├─ agent/                      # Agent核心：配置、协议、历史和工具循环
│  │  ├─ config.ts                # 服务商和默认配置
│  │  ├─ runtime.ts               # Agent总调度
│  │  ├─ network.ts               # 模型请求和连接测试
│  │  ├─ history.ts               # 对话历史裁剪
│  │  ├─ toolLoop.ts              # 工具调用循环
│  │  └─ transports/              # Responses / Chat协议适配
│  ├─ lib/
│  │  ├─ planner.ts               # 校园路线算法
│  │  ├─ beijingPlanner.ts        # 北京城市路线算法
│  │  ├─ agent.ts                 # Agent兼容入口
│  │  ├─ localAgent.ts            # 无密钥时的规则助手
│  │  └─ storage.ts               # localStorage 状态钩子
│  ├─ styles/global.css
│  └─ types.ts
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
└─ api/chat/completions.mjs       # Vercel 千问代理
```

## 路线是怎么算出来的

北京城市路线和校园路线分开计算，避免把跨区公共交通与校园步行混为一谈。

城市路线使用经纬度计算点位间距离，再按“近距离步行、远距离公共交通”的策略估算换乘时间；每轮综合兴趣匹配、必看权重、用户明确加入项、距离与时间选择下一站。校园路线继续使用原有精细点位坐标与步行算法。

1. **筛选**：只保留与所选兴趣匹配、或标记为「必看」的点位。
2. **打分**：`兴趣匹配数 × 3 + 必看加成 − 步行耗时 × 0.22 − 建议停留 × 0.012`，让「顺路」和「匹配兴趣」同时起作用。
3. **贪心排程**：从出发门岗开始，每轮挑选当前分数最高、且塞得进剩余时间的点位，累加步行与停留时间，直到时间用尽（最多 8 站）。
4. **兜底**：时间极紧时，至少给出离起点最近的一个点位。

距离由示意图坐标换算（约 1.1 米/单位），步速基准 78 米/分钟，再按「悠闲 / 标准 / 紧凑」缩放。

## 数据说明

- 北京路线的基础点位在 `src/data/beijingPlaces.ts` 中维护，当前覆盖全部 16 个行政区的代表性目的地；路线计算不依赖模型编造点位。
- 地图数据来自 **OpenStreetMap**（通过 Overpass API 抓取，© OpenStreetMap contributors，ODbL 许可）：校园边界、139 栋建筑轮廓、131 条道路、35 块绿地都是真实地理数据，等距投影到 900×900 画布后渲染成 SVG，不依赖任何地图瓦片服务，因此国内也能正常显示。
- 建筑名称与位置对应 OSM 上实际标注的对象；点位讲解、停留时长、距离与最佳观赏期仍为估算值。
- 入校政策、场馆开放时间、景区票价会变动，**出行前请以学校和景区最新公告为准**。
- 点位为公开可见的校园地点，未包含任何个人或隐私信息。

## 参与贡献

欢迎补充点位、修正信息或增加周边线路：改 `src/data/` 下的数据文件即可，新增点位请同时给出 `interests`、坐标与讲解文案。

## License

MIT

## 数据库维护

景点新增、修订、批量导入预览、版本历史与归档恢复见 [维护说明](docs/place-database-maintenance.md)。公开接口保持只读，千问不直接写库。
