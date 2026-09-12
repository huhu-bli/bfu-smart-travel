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

## 快速开始

```bash
npm install
npm run dev      # 本地开发，默认 http://localhost:5173
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
npm run typecheck # TypeScript 类型检查
```

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
│  │  └─ storage.ts               # localStorage 状态钩子
│  ├─ styles/global.css
│  └─ types.ts
├─ index.html
├─ vite.config.ts
└─ tsconfig.json
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
