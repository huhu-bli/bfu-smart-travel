export type SchoolCategory = 'university' | 'middle' | 'primary' | 'vocational';

export interface SchoolCategoryOption {
  id: 'all' | SchoolCategory;
  label: string;
  emoji: string;
}

export interface SchoolSearchTask {
  category: SchoolCategory;
  keyword: string;
}

export const HAIDIAN_CENTER: [number, number] = [116.298, 39.959];

export const SCHOOL_CATEGORY_OPTIONS: SchoolCategoryOption[] = [
  { id: 'all', label: '全部学校', emoji: '🏫' },
  { id: 'university', label: '高校', emoji: '🎓' },
  { id: 'middle', label: '中学', emoji: '📘' },
  { id: 'primary', label: '小学', emoji: '🎒' },
  { id: 'vocational', label: '职业院校', emoji: '🛠️' },
];

/**
 * 学校数据不写死在提示词或组件中。页面运行时使用这些检索任务向地图服务查询，
 * 后续增加幼儿园、科研院所等分类时只需扩展此配置。
 */
export const SCHOOL_SEARCH_TASKS: SchoolSearchTask[] = [
  { category: 'university', keyword: '高等院校' },
  { category: 'middle', keyword: '中学' },
  { category: 'primary', keyword: '小学' },
  { category: 'vocational', keyword: '职业技术学校' },
];

export function schoolCategoryLabel(category: SchoolCategory): string {
  return SCHOOL_CATEGORY_OPTIONS.find((item) => item.id === category)?.label ?? '学校';
}
