export type HaidianPlaceCategory =
  | 'attraction'
  | 'park'
  | 'museum'
  | 'university'
  | 'food'
  | 'transit';

export interface HaidianCategoryOption {
  id: 'all' | HaidianPlaceCategory;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
}

export interface HaidianSearchTask {
  category: HaidianPlaceCategory;
  keyword: string;
  pages: number;
  pageSize: number;
}

export const HAIDIAN_CENTER: [number, number] = [116.298, 39.959];

export const HAIDIAN_CATEGORY_OPTIONS: HaidianCategoryOption[] = [
  { id: 'all', label: '全部', shortLabel: '全部', emoji: '🧭', description: '浏览全部旅行点位' },
  { id: 'attraction', label: '景点', shortLabel: '景点', emoji: '🏯', description: '风景名胜与热门去处' },
  { id: 'park', label: '公园', shortLabel: '公园', emoji: '🌳', description: '城市公园与自然空间' },
  { id: 'museum', label: '文博展馆', shortLabel: '文博', emoji: '🏛️', description: '博物馆、纪念馆与展馆' },
  { id: 'university', label: '高校', shortLabel: '高校', emoji: '🎓', description: '海淀高校与校园点位' },
  { id: 'food', label: '餐饮', shortLabel: '餐饮', emoji: '🍜', description: '旅行途中餐厅与特色美食' },
  { id: 'transit', label: '地铁交通', shortLabel: '地铁', emoji: '🚇', description: '地铁站与出行换乘点' },
];

/**
 * 综合旅行地图的运行时检索配置。数据不写死在组件或 Agent 提示词中，
 * 后续增加酒店、购物等图层时只需扩展分类和任务。
 * 每类最多查询 50 条，兼顾海淀覆盖范围与手机端渲染性能。
 */
export const HAIDIAN_SEARCH_TASKS: HaidianSearchTask[] = [
  { category: 'attraction', keyword: '旅游景点', pages: 2, pageSize: 25 },
  { category: 'park', keyword: '公园', pages: 2, pageSize: 25 },
  { category: 'museum', keyword: '博物馆', pages: 2, pageSize: 25 },
  { category: 'university', keyword: '高等院校', pages: 2, pageSize: 25 },
  { category: 'food', keyword: '特色餐厅', pages: 2, pageSize: 25 },
  { category: 'transit', keyword: '地铁站', pages: 2, pageSize: 25 },
];

export function haidianCategoryOf(category: HaidianPlaceCategory): HaidianCategoryOption {
  return (
    HAIDIAN_CATEGORY_OPTIONS.find((item) => item.id === category) ??
    HAIDIAN_CATEGORY_OPTIONS[0]
  );
}
