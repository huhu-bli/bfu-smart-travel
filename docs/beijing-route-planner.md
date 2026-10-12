# 北京路线规划器

## 目标

在不破坏原有校园插件、场景路由、提示词层和工具层的前提下，把海淀静态线路推荐升级为北京市 16 区结构化路线规划。

## 双规划器结构

```text
用户输入
  ↓
TravelTarget：北京全域 / 行政区 / 校园
  ↓
SceneRouter
  ├─ campus-route → build_route → planner.ts
  └─ outside-trip → build_beijing_route → beijingPlanner.ts
  ↓
GlobalRoutePlan 联合类型
  ↓
全局计划条 / 路线编辑器 / 地图
```

城市和校园没有共用同一套距离公式：校园使用步行与局部坐标，北京城市路线使用经纬度、行政区聚合和公共交通启发式估算。这样可以防止“故宫到颐和园”被错误计算成校园步行。

## 北京路线数据

`src/data/beijingPlaces.ts` 维护确定性基础点位，包含：

- 16 个行政区；
- 城市地标、历史古迹、文博场馆、公园、高校和街区；
- 经纬度、建议停留、兴趣标签、亮点与提示；
- 模型和规划器共同使用的稳定 id。

新增点位只改数据层，不把景点写入提示词。

## 规划步骤

1. 根据行政区、排除项筛选候选点位。
2. 将用户明确指定的点位设为最高权重。
3. 选择首站，先用球面距离和交通启发式完成稳定排程。
4. 通过 `routeProviders/amap.ts` 并行查询必游主线的每段高德步行或公交路线，替换实际时间、距离和道路轨迹；可选点加入主线后再查询，以减少配额消耗。
5. 综合兴趣、必看权重、换乘时间和距离进行贪心排程。
6. 超出时间预算的合适点位进入“可选站点”。
7. 返回剩余时间建议，并写入全局计划。

高德不可用、超时或某一段没有结果时，只回退失败路段，不会丢失整个计划。路线通过 `routeProvider` 标记为 `amap`、`hybrid` 或 `estimate`。

## Agent 工具

| 工具 | 作用 |
| --- | --- |
| `list_beijing_places` | 查询行政区内可用点位及 id |
| `build_beijing_route` | 生成可保存、可编辑的城市路线 |
| `get_beijing_place_detail` | 获取点位说明与游览提示 |
| `get_weather` | 查询目的地天气 |

`outside-trip` 场景只看到城市工具；`campus-route` 仍只看到校园工具。工具隔离继续防止场景串味。

## 高德适配层

```text
beijingPlanner.ts（确定路线顺序）
  ↓
routeProviders/amap.ts（查询每段真实步行/公交）
  ↓ 成功                    ↓ 失败
真实时间、距离、道路轨迹     保留本地估算
  ↓
GlobalRoutePlan / Agent / BeijingMap
```

地图 SDK、Key 读取、超时控制和结果解析全部在适配层内。规划算法、提示词、点位数据和 UI 不直接依赖高德响应结构。

## 扩展规则

后续增加驾车、骑行或后端 Web 服务 API 时，应继续实现新的 provider，不要把网络请求、API Key 或地图 SDK 逻辑写入提示词、核心规划器或静态数据文件。

