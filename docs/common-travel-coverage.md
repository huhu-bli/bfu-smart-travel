# 北京常见旅行需求：资料扩充批次一

本批补充 19 条城市地点，保持 PostgreSQL、只读查询接口、场景路由和路线算法的现有分层。千问只查询和解释资料，不负责凭空生成景点入库。

## 覆盖目标

| 需求 | 已有与新增资料示例 | 使用边界 |
| --- | --- | --- |
| 初次来京的一日游 | 故宫、景山、前门 | 按预算取舍；不承诺自动获得预约 |
| 京味美食与街区漫步 | 牛街、前门、簋街 | 街区不是单家餐馆；不提供未经核实的人均价格 |
| 公园与慢步摄影 | 玉渊潭、紫竹院、陶然亭、南海子 | 花期与当日叶色仍须确认 |
| 室内文化与科普 | 国家自然博物馆、中国科技馆、军博、城市图书馆 | 下雨时可手动按“室内”查询；不是实时可入场保证 |
| 家庭科普与游乐 | 科技馆、铁道东郊馆、航空博物馆、石景山游乐园 | 不保证所有项目适合所有年龄，须核实身高年龄限制 |
| 古建筑与园林 | 恭王府、孔庙、大观园 | 不把邻近场馆合并成同一个点位 |

## 新增地点与事实来源

| 地点 | 行政区 | 分类 | 来源 |
| --- | --- | --- |
| 景山公园 | 西城 | park | [官方资料](https://www.beijing.gov.cn/renwen/rwzyd/lyjq/4A/jsgy/202210/t20221019_2839458.html) |
| 陶然亭公园 | 西城 | park | [官方资料](https://gygl.beijing.gov.cn/dwjj/dwjj_zsdw/201911/t20191129_728862.html) |
| 玉渊潭公园 | 海淀 | park | [官方资料](https://gygl.beijing.gov.cn/dwjj/dwjj_zsdw/201911/t20191129_728859.html) |
| 紫竹院公园 | 海淀 | park | [官方资料](https://gygl.beijing.gov.cn/dwjj/dwjj_zsdw/201911/t20191129_728904.html) |
| 北京大观园 | 西城 | park | [官方资料](https://wwj.beijing.gov.cn/bjww/362771/362772/545892/index.html) |
| 恭王府博物馆 | 西城 | heritage | [官方资料](https://wwj.beijing.gov.cn/bjww/362771/362772/545949/index.html) |
| 北京孔庙 | 东城 | heritage | [官方资料](https://www.beijing.gov.cn/renwen/rwzyd/qgzdwwbhdw/bjkm/202210/t20221027_2845971.html) |
| 国家自然博物馆 | 东城 | museum | [官方资料](https://wwj.beijing.gov.cn/bjww/362771/362772/545772/index.html) |
| 中国科学技术馆 | 朝阳 | museum | [官方资料](https://english.beijing.gov.cn/travellinginbeijing/museums/202603/t20260323_4563774.html) |
| 中国铁道博物馆东郊展馆 | 朝阳 | museum | [官方资料](https://wwj.beijing.gov.cn/bjww/362771/362772/546045/index.html) |
| 中国人民革命军事博物馆 | 海淀 | museum | [官方资料](https://www.jb.mil.cn/) |
| 中国园林博物馆 | 丰台 | museum | [官方资料](https://map.beijing.gov.cn/place?categoryId=bwg&placeId=5c2dc4a0080b852d3f422a26) |
| 前门大街 | 东城 | neighborhood | [官方资料](https://www.beijing.gov.cn/zhengce/gfxwj/201905/t20190522_58010.html) |
| 簋街 | 东城 | neighborhood | [官方资料](https://www.beijing.gov.cn/zhengce/gfxwj/201905/t20190522_58010.html) |
| 牛街 | 西城 | neighborhood | [官方资料](https://www.beijing.gov.cn/renwen/zt/jcxclyjc/ldzn/xltj/202601/t20260130_4477184.html) |
| 北京城市图书馆 | 通州 | landmark | [官方资料](https://map.beijing.gov.cn/place?categoryId=tsg&placeId=66b066ffe4a9ed67df2d566e) |
| 南海子公园 | 大兴 | park | [官方资料](https://tyj.beijing.gov.cn/bjsports/gzdt84/zwdt/436240030/index.html) |
| 石景山游乐园 | 石景山 | landmark | [官方资料](https://map.beijing.gov.cn/place?categoryId=lyzxz&placeId=60cb3ca9bd15ba1c65342ec9) |
| 中国航空博物馆 | 昌平 | museum | [官方资料](https://wwj.beijing.gov.cn/bjww/362771/362773/546544/index.html) |

## 资料与坐标边界

- 核对日期为 2026-10-19。名称、行政区及介绍参考官方页面；停留时长是产品估算，不是官方游览承诺。
- 开放时间与预约地址仍留 null，票价保留待核实说明；不因为读过一篇旧公告就标记为已实地核实。
- 每条记录保留官方事实来源与独立坐标来源。坐标来自 Wikidata 的 P625（CC0），离线转换为 GCJ02 后再入库。原始 WGS84、精度、实体和语句编号保存在 provenance 文件。
- 坐标是地点参考位置，未确认实际开放入口。转换解决坐标系偏移，不提高原始资料精度。
- 中国科技馆明确选择北辰东路新馆，排除北京科学中心旧馆坐标；中山公园因当前候选坐标精度不足，暂缓导入。鲜鱼口、大栅栏、五道营、鲜花港等待实体和坐标核对。
- 美食街区继续归类 neighborhood；没有把整条街伪装成具体餐馆。

## 导入方式

本批使用已有维护工具，不修改 seed 旧资料、不修改已执行迁移、不自动覆盖重复 id。创建完成的新地点会立即出现在数据库查询中，无需重建前端。代码部署与数据导入是两个步骤。

```bash
npm run db:build-common
npm run db:validate -- database/catalogs/beijing-common-travel.json
npm run db:expand-common
npm run db:expand-common -- --apply --actor huhu
```

前两步生成并校验资料；第三步是全部回滚的预览；第四步才写入当前 DATABASE_URL 指向的数据库。先执行 npm run db:migrate。没有连接串时，命令只操作本地开发数据库。重复导入会拒绝覆盖，需先导出已有记录再用 update 与 expectedVersion 修订。

原有 86 条 + 本批 19 条 = 目标 105 条，其中城市 67、北林 25、北交 13。是否完成云端导入以实际查询计数为准。

## 验证

测试用真实 PostgreSQL 兼容引擎执行迁移、导入预览、关联资料与查询，验证经典一日游、牛街半日游、科普三小时路线；新增城市名称只需存在数据库即可从校园场景切换，不必写进前端静态点位常量。数据库故障不退回旧数组冒充成功。

未覆盖：全部北京地点、实时剩余门票、具体餐馆营业与价格、实时人流、无障碍路线、多日住宿和跨城市旅行。下一批优先核对具体餐馆与官方预约入口，再扩充更细的郊区目的地。
