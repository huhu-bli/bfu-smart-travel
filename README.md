# 北林智能旅行 · BFU Smart Travel

一个面向北京林业大学的校园智能游览与周边出行助手：回答四个问题（兴趣、时长、步速、出发门岗），自动生成一条顺路的校园路线，并配套点位讲解、示意图地图、周边一日游与出行清单。

纯前端单页应用（React + Vite + TypeScript），不需要后端、不需要登录，构建产物可以直接托管在 GitHub Pages 上。

## 功能

| 模块 | 说明 |
| --- | --- |
| 智能路线 | 按兴趣标签、可用时长、步速节奏与出发门岗，自动挑选并排序点位，给出到站/离站时间、步行距离与推荐理由 |
| 校园地图 | 手绘风格 SVG 示意图，路线高亮并带绘制动画，点击任意点位查看讲解 |
| 点位图鉴 | 19 个校园点位，支持关键词搜索、兴趣筛选、收藏（保存在浏览器本地） |
| 周边一日游 | 奥森、圆明园、颐和园、香山、鹫峰实验林场、五道口 6 条线路，含时间轴、预算、交通与提示 |
| 出行清单 | 五大类打包清单，勾选进度自动保存到 `localStorage` |
| AI 行程助手 | 右下角对话面板，用自然语言排路线、讲点位、推校外行程；支持「直连（自用）」与「代理（可公开）」双模式 |

## 快速开始

```bash
npm install
npm run dev      # 本地开发，默认 http://localhost:5173
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
npm run typecheck # TypeScript 类型检查
```

## AI 行程助手（Agent）

右下角的小机器人就是入口。它用 OpenAI 的 Responses API + 工具调用，把大模型接到本项目已有的数据和算法上：模型负责理解需求、选参数，路线和点位内容全部由本地函数产出，不会出现模型编造点位或时间的情况。

### 两种模式

| 模式 | 密钥位置 | 适用 | 怎么配 |
| --- | --- | --- | --- |
| 直连（自用） | 浏览器 `localStorage` | 自己用、本地演示 | 设置里粘贴 API Key |
| 代理（可公开） | Serverless 环境变量 | 分享给同学、公开部署 | 部署 `worker/`，设置里填代理地址 |

直连零部署，但密钥在使用者的浏览器里；代理需要多部署一个 Cloudflare Worker，密钥永远不出服务端。两种模式在同一个面板里切换。

### 直连模式

1. 到 [OpenAI API keys](https://platform.openai.com/settings/organization/api-keys) 建一个密钥（建议单独建一个，方便随时吊销）。
2. 打开应用右下角「AI 行程助手」→ ⚙ → 选 **直连（自用）** → 粘贴密钥。
3. 直接提问，例如「我只有 1 小时，从东门进，怎么逛最值？」

密钥只写入当前浏览器的 `localStorage`，本项目没有后端，也没有任何地方会把它传出去。**请不要把密钥写进仓库或截图分享。**

### 连不上怎么办

设置面板里有「测试连接」按钮，它打一次不产生生成费用的请求，直接把问题定位到具体环节：

| 提示 | 含义 | 处理 |
| --- | --- | --- |
| 连不上 `https://api.openai.com/v1` | 这台设备的网络到不了 OpenAI | 换网络，或改用代理模式；若代理域名也被拦，给 Worker 绑一个自己的域名 |
| 网络与跨域都正常，但 API Key 无效（401） | 网络没问题，是密钥 | 换一个有效的密钥 |
| 能连上 OpenAI，但浏览器发不出 POST 请求 | GET 通、POST 被拦（跨域策略或安全软件） | 直连模式无法使用，改用代理模式 |
| 可用模型里没有 `xxx` | 网络和密钥都正常 | 换成提示里列出的可用模型 |

网络到不了 OpenAI 时，浏览器只会报一个笼统的「网络请求失败」，所以先点测试连接再排查，能省很多时间。

自检会分别测两件事：先用 `GET /v1/models` 判断网络和密钥，再用一把无效密钥试发一次 `POST /v1/responses`（不产生费用）判断浏览器能不能真的发起请求。有些校园网、安全客户端或浏览器插件会放行 GET 却拦掉 POST，这种情况下浏览器直连永远走不通，只能用代理模式。

如果你已经有自己的 OpenAI 兼容中转，可以在「API 地址」里填它的 `/v1` 地址（例如 `https://your-relay.com/v1`），留空就用官方地址。

### 代理模式

见 [`worker/README.md`](worker/README.md)，三步：`wrangler login` → `wrangler secret put OPENAI_API_KEY` → `wrangler deploy`。拿到 `https://xxx.workers.dev` 后填进设置面板即可，建议同时设置 `APP_TOKEN` 访问口令。

### 暴露给模型的工具

| 工具 | 作用 | 对应的本地实现 |
| --- | --- | --- |
| `list_spots` | 按兴趣或关键词查点位、拿点位 id | `src/data/spots.ts` |
| `build_route` | 生成路线，返回有序站点与时间 | `src/lib/planner.ts` 的 `buildRoute()` |
| `get_spot_detail` | 取某点位的讲解、亮点、最佳时段、贴士 | `src/data/spots.ts` |
| `suggest_trip` | 推荐校外半日/一日行程 | `src/data/trips.ts` |

模型返回工具调用后，前端执行本地函数，把结果作为 `function_call_output` 回传，再拿最终回复——就是官方文档里的标准五步循环。工具使用 `strict: true`，并要求 `additionalProperties: false`、所有字段都出现在 `required` 里；同时设了 `parallel_tool_calls: false`，避免一次并发调用多个工具。

模型名在设置里可改，默认 `gpt-6-astra`（官方文档指出该模型的工具调用需走 Responses API），也可以换成 `gpt-5.6` 等账号可用的模型。

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
│  │  ├─ spots.ts                 # 校园点位数据（19 个）
│  │  ├─ trips.ts                 # 周边线路数据（6 条）
│  │  └─ interests.ts             # 兴趣标签、时长、步速、门岗
│  ├─ lib/
│  │  ├─ planner.ts               # 路线生成算法
│  │  ├─ agent.ts                 # 工具定义 + Responses API 调用循环
│  │  └─ storage.ts               # localStorage 状态钩子
│  ├─ styles/global.css
│  └─ types.ts
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
└─ worker/                        # 代理模式下使用的 Cloudflare Worker
```

## 路线是怎么算出来的

1. **筛选**：只保留与所选兴趣匹配、或标记为「必看」的点位。
2. **打分**：`兴趣匹配数 × 3 + 必看加成 − 步行耗时 × 0.22 − 建议停留 × 0.012`，让「顺路」和「匹配兴趣」同时起作用。
3. **贪心排程**：从出发门岗开始，每轮挑选当前分数最高、且塞得进剩余时间的点位，累加步行与停留时间，直到时间用尽（最多 8 站）。
4. **兜底**：时间极紧时，至少给出离起点最近的一个点位。

距离由示意图坐标换算（约 1.1 米/单位），步速基准 78 米/分钟，再按「悠闲 / 标准 / 紧凑」缩放。

## 数据说明

- 项目**不依赖任何外部接口**，所有点位、线路、时间与距离都在 `src/data/` 里以 TypeScript 常量维护，改数据即可改路线。
- 地图是**手绘示意图**，不是测绘成果；距离、时长、最佳观赏期均为按公开常识整理的估算值。
- 入校政策、场馆开放时间、景区票价会变动，**出行前请以学校和景区最新公告为准**。
- 点位为公开可见的校园地点，未包含任何个人或隐私信息。

## 参与贡献

欢迎补充点位、修正信息或增加周边线路：改 `src/data/` 下的数据文件即可，新增点位请同时给出 `interests`、坐标与讲解文案。

## License

MIT
