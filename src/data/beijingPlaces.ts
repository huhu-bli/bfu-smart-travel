import type {
  BeijingDistrictId,
  BeijingPlace,
  BeijingPlaceCategory,
  InterestId,
} from '../types';

export const BEIJING_CENTER: [number, number] = [116.4074, 39.9042];

export const BEIJING_DISTRICTS: Array<{
  id: BeijingDistrictId;
  label: string;
  aliases: string[];
}> = [
  { id: 'dongcheng', label: '东城区', aliases: ['东城'] },
  { id: 'xicheng', label: '西城区', aliases: ['西城'] },
  { id: 'chaoyang', label: '朝阳区', aliases: ['朝阳'] },
  { id: 'haidian', label: '海淀区', aliases: ['海淀'] },
  { id: 'fengtai', label: '丰台区', aliases: ['丰台'] },
  { id: 'shijingshan', label: '石景山区', aliases: ['石景山'] },
  { id: 'mentougou', label: '门头沟区', aliases: ['门头沟'] },
  { id: 'fangshan', label: '房山区', aliases: ['房山'] },
  { id: 'tongzhou', label: '通州区', aliases: ['通州', '北京城市副中心'] },
  { id: 'shunyi', label: '顺义区', aliases: ['顺义'] },
  { id: 'changping', label: '昌平区', aliases: ['昌平'] },
  { id: 'daxing', label: '大兴区', aliases: ['大兴'] },
  { id: 'huairou', label: '怀柔区', aliases: ['怀柔'] },
  { id: 'pinggu', label: '平谷区', aliases: ['平谷'] },
  { id: 'miyun', label: '密云区', aliases: ['密云'] },
  { id: 'yanqing', label: '延庆区', aliases: ['延庆'] },
];

export const BEIJING_DISTRICT_IDS = BEIJING_DISTRICTS.map((item) => item.id);

export const BEIJING_CATEGORY_LABELS: Record<BeijingPlaceCategory, string> = {
  landmark: '城市地标',
  heritage: '历史古迹',
  museum: '文博场馆',
  park: '公园自然',
  university: '高校',
  neighborhood: '街区漫游',
};

const place = (
  id: string,
  name: string,
  districtId: BeijingDistrictId,
  district: string,
  category: BeijingPlaceCategory,
  emoji: string,
  lng: number,
  lat: number,
  visit: number,
  interests: InterestId[],
  short: string,
  highlights: string[],
  bestTime: string,
  mustSee = false,
  tips = '',
): BeijingPlace => ({
  id,
  name,
  districtId,
  district,
  category,
  emoji,
  lng,
  lat,
  visit,
  interests,
  short,
  description: short,
  highlights,
  bestTime,
  mustSee,
  tips,
});

/**
 * 北京城市路线的确定性基础点位库。
 * 坐标用于估算点位间直线距离和地图展示；实际交通、开放时间与预约要求以官方信息为准。
 */
export const BEIJING_PLACES: BeijingPlace[] = [
  place('forbidden-city', '故宫博物院', 'dongcheng', '东城区', 'heritage', '🏯', 116.397, 39.9163, 180, ['culture', 'photo'], '北京中轴线上最具代表性的宫殿建筑群。', ['中轴线', '古建筑', '宫廷文化'], '上午', true, '通常需要提前预约，周一开放情况请以官方公告为准。'),
  place('national-museum', '中国国家博物馆', 'dongcheng', '东城区', 'museum', '🏛️', 116.4074, 39.904, 180, ['culture', 'research'], '系统了解中国历史与文化的重要国家级博物馆。', ['国家级博物馆', '历史展览'], '上午', true, '建议提前预约并预留安检时间。'),
  place('temple-of-heaven', '天坛公园', 'dongcheng', '东城区', 'heritage', '⛩️', 116.4066, 39.8819, 150, ['culture', 'photo', 'plant'], '明清皇家祭天建筑群，也是经典中轴线景观。', ['祈年殿', '古柏', '中轴线'], '清晨或傍晚', true),
  place('lama-temple', '雍和宫', 'dongcheng', '东城区', 'heritage', '🛕', 116.4172, 39.9471, 90, ['culture', 'photo'], '保存完整的清代寺院建筑群。', ['寺院建筑', '胡同街区'], '上午'),
  place('nanluoguxiang', '南锣鼓巷', 'dongcheng', '东城区', 'neighborhood', '🏘️', 116.4032, 39.937, 90, ['culture', 'food', 'photo'], '适合步行感受胡同肌理与街区生活。', ['胡同', '街巷', '小店'], '傍晚'),
  // 来源：https://yllhj.beijing.gov.cn/zwgk/zwxx/202310/t20231020_3283423.shtml
  place('ditan-park', '地坛公园', 'dongcheng', '东城区', 'park', '🍂', 116.414443, 39.953777, 90, ['plant', 'culture', 'photo'], '园内银杏大道是北京的秋季赏叶地点。', ['银杏大道', '银杏', '古坛'], '秋季下午', false, '叶色、开放时间以当日官方信息为准。'),

  place('beihai-park', '北海公园', 'xicheng', '西城区', 'park', '🌊', 116.389, 39.9255, 120, ['plant', 'culture', 'photo'], '皇家园林与湖面景观结合的城市公园。', ['白塔', '湖景', '皇家园林'], '下午', true),
  place('shichahai', '什刹海', 'xicheng', '西城区', 'neighborhood', '🛶', 116.3852, 39.941, 120, ['culture', 'food', 'photo'], '由湖泊、胡同和历史街区组成的步行区域。', ['湖景', '胡同', '夜景'], '傍晚'),
  place('capital-museum', '首都博物馆', 'xicheng', '西城区', 'museum', '🏺', 116.341, 39.9055, 150, ['culture', 'research'], '聚焦北京城市历史、民俗与文物。', ['北京历史', '民俗展'], '上午'),
  place('beijing-zoo', '北京动物园', 'xicheng', '西城区', 'park', '🐼', 116.3374, 39.9385, 180, ['plant', 'research', 'photo'], '适合亲子与动物观察的综合园区。', ['大熊猫', '动物科普'], '上午'),
  // 来源：https://www.beijing.gov.cn/renwen/zt/qrshzjc/202210/t20221026_2845499.html
  place('yuetan-park', '月坛公园', 'xicheng', '西城区', 'park', '🍂', 116.352221, 39.916424, 90, ['plant', 'culture', 'photo'], '园内栽植银杏和元宝枫，适合秋季赏叶。', ['银杏', '元宝枫', '古坛'], '秋季下午', false, '叶色、开放时间以当日官方信息为准。'),

  place('olympic-park', '北京奥林匹克公园', 'chaoyang', '朝阳区', 'landmark', '🏟️', 116.3975, 40.0007, 150, ['sport', 'photo'], '鸟巢、水立方与城市公共空间集中分布。', ['鸟巢', '水立方', '夜景'], '傍晚', true),
  place('aosen', '奥林匹克森林公园', 'chaoyang', '朝阳区', 'park', '🌲', 116.3883, 40.0172, 180, ['plant', 'sport', 'photo'], '适合慢跑、骑行与城市自然观察的大型公园。', ['湿地', '慢跑', '四季景观'], '清晨'),
  place('art-798', '798艺术区', 'chaoyang', '朝阳区', 'neighborhood', '🎨', 116.4977, 39.9841, 150, ['culture', 'photo'], '由工业遗产转型而来的当代艺术街区。', ['当代艺术', '工业建筑', '展览'], '下午'),
  place('chaoyang-park', '朝阳公园', 'chaoyang', '朝阳区', 'park', '🌳', 116.4829, 39.946, 120, ['plant', 'sport', 'photo'], '开阔的城市公园，适合散步和休闲。', ['草坪', '湖景', '运动'], '下午'),
  place('sanlitun', '三里屯', 'chaoyang', '朝阳区', 'neighborhood', '🌃', 116.4551, 39.9337, 120, ['food', 'photo'], '餐饮、商业与夜间城市生活集中的街区。', ['城市夜景', '餐饮', '街拍'], '傍晚'),

  place('summer-palace', '颐和园', 'haidian', '海淀区', 'heritage', '⛩️', 116.2723, 39.9999, 240, ['plant', 'culture', 'photo'], '以昆明湖和万寿山为核心的皇家园林。', ['昆明湖', '长廊', '佛香阁'], '上午', true),
  place('yuanmingyuan', '圆明园遗址公园', 'haidian', '海淀区', 'heritage', '🪷', 116.3038, 40.0081, 180, ['plant', 'culture', 'photo'], '遗址、湖泊与季节植物景观并存。', ['西洋楼遗址', '荷塘', '历史'], '下午', true),
  place('fragrant-hills', '香山公园', 'haidian', '海淀区', 'park', '🍁', 116.187, 39.9909, 240, ['plant', 'sport', 'photo'], '西山山地公园，秋季红叶最具代表性。', ['红叶', '登山', '城市远眺'], '清晨'),
  place('national-botanical-garden', '国家植物园', 'haidian', '海淀区', 'park', '🌿', 116.2165, 40.003, 240, ['plant', 'research', 'photo'], '植物保育、科研科普与园林游览结合。', ['植物多样性', '温室', '科普'], '上午'),
  place('peking-university', '北京大学', 'haidian', '海淀区', 'university', '🎓', 116.3055, 39.9928, 150, ['culture', 'research', 'photo'], '历史建筑、湖景与校园文化相结合。', ['未名湖', '博雅塔', '校园建筑'], '下午', true, '入校政策以学校最新公告为准。'),
  place('tsinghua-university', '清华大学', 'haidian', '海淀区', 'university', '🎓', 116.3269, 40.003, 150, ['culture', 'research', 'photo'], '近代校园建筑与高校人文景观丰富。', ['清华园', '荷塘', '校园建筑'], '下午', true, '入校政策以学校最新公告为准。'),
  place('beijing-jiaotong-university', '北京交通大学', 'haidian', '海淀区', 'university', '🎓', 116.337, 39.9505, 120, ['culture', 'research', 'photo'], '主校区以饮水思源碑、明湖等校园景观为代表。', ['北交', '北交大', '思源碑', '明湖'], '白天', false, '此处为主校区示意位置；入校安排请以学校公告为准。'),
  place('zhongguancun', '中关村', 'haidian', '海淀区', 'neighborhood', '💻', 116.3165, 39.9836, 90, ['research', 'food'], '北京科技创新与高校生活交汇的城市片区。', ['科技街区', '商业', '高校周边'], '傍晚'),

  place('garden-expo', '北京园博园', 'fengtai', '丰台区', 'park', '🌺', 116.1956, 39.8754, 240, ['plant', 'culture', 'photo'], '集中展示不同地域园林风格的大型园区。', ['园林', '永定塔', '湿地'], '上午'),
  place('marco-polo-bridge', '卢沟桥', 'fengtai', '丰台区', 'heritage', '🌉', 116.2136, 39.8492, 90, ['culture', 'photo'], '具有重要历史价值的古桥与纪念地。', ['古桥', '石狮', '历史'], '下午'),

  place('shougang-park', '首钢园', 'shijingshan', '石景山区', 'landmark', '🏭', 116.159, 39.9087, 150, ['culture', 'sport', 'photo'], '工业遗产、冬奥设施与城市更新融合的园区。', ['工业遗产', '冬奥', '城市更新'], '下午', true),
  place('badachu', '八大处公园', 'shijingshan', '石景山区', 'park', '⛰️', 116.1904, 39.9605, 210, ['plant', 'culture', 'sport'], '西山余脉中的山地寺庙园林。', ['登山', '古刹', '银杏'], '上午'),

  place('tanzhe-temple', '潭柘寺', 'mentougou', '门头沟区', 'heritage', '🛕', 116.0336, 39.9023, 180, ['culture', 'plant', 'photo'], '北京地区历史悠久的古寺与山林景观。', ['古寺', '古树', '山景'], '上午', true),
  place('jietai-temple', '戒台寺', 'mentougou', '门头沟区', 'heritage', '🌲', 116.0929, 39.8747, 150, ['culture', 'plant'], '以古松和戒坛建筑闻名的寺院。', ['古松', '戒坛', '山林'], '上午'),

  place('zhoukoudian', '周口店北京人遗址博物馆', 'fangshan', '房山区', 'museum', '🦴', 115.9294, 39.6896, 180, ['culture', 'research'], '展示古人类演化与遗址考古成果。', ['古人类', '考古', '世界遗产'], '上午', true),
  place('shidu', '十渡风景区', 'fangshan', '房山区', 'park', '🏞️', 115.6, 39.642, 300, ['plant', 'sport', 'photo'], '拒马河峡谷中的山水户外目的地。', ['峡谷', '河流', '户外'], '全天'),

  place('universal-beijing', '北京环球度假区', 'tongzhou', '通州区', 'landmark', '🎢', 116.684, 39.856, 480, ['photo', 'food'], '大型主题公园与度假商业区。', ['主题乐园', '演出', '夜景'], '全天', true, '建议提前购票并查看当日运营安排。'),
  place('grand-canal-museum', '北京大运河博物馆', 'tongzhou', '通州区', 'museum', '🚢', 116.718, 39.907, 150, ['culture', 'research'], '展示大运河历史文化的专题博物馆。', ['大运河', '城市副中心', '建筑'], '上午', true),
  place('grand-canal-forest-park', '大运河森林公园', 'tongzhou', '通州区', 'park', '🌳', 116.724, 39.88, 180, ['plant', 'sport', 'photo'], '沿运河展开的滨水绿地与骑行空间。', ['运河', '骑行', '滨水'], '下午'),

  place('olympic-rowing-park', '顺义奥林匹克水上公园', 'shunyi', '顺义区', 'park', '🚣', 116.684, 40.178, 180, ['sport', 'photo', 'plant'], '奥运水上项目场馆与滨水休闲空间。', ['水上运动', '滨水', '奥运场馆'], '下午'),

  place('ming-tombs', '明十三陵', 'changping', '昌平区', 'heritage', '🏯', 116.225, 40.255, 240, ['culture', 'photo'], '明代皇家陵寝群与山谷景观。', ['世界遗产', '陵寝建筑', '历史'], '上午', true),
  place('juyongguan', '居庸关长城', 'changping', '昌平区', 'heritage', '🧱', 116.068, 40.291, 240, ['culture', 'sport', 'photo'], '关城与山地长城结合的经典长城段。', ['长城', '关城', '登高'], '上午', true),

  place('beijing-wildlife-park', '北京野生动物园', 'daxing', '大兴区', 'park', '🦁', 116.33, 39.502, 360, ['research', 'photo', 'plant'], '以野生动物科普与观赏为主的大型园区。', ['动物科普', '亲子', '园区游览'], '上午'),

  place('mutianyu', '慕田峪长城', 'huairou', '怀柔区', 'heritage', '🧱', 116.56, 40.431, 300, ['culture', 'sport', 'photo'], '植被覆盖较高、视野开阔的长城段。', ['长城', '山景', '摄影'], '上午', true),
  place('yanqi-lake', '雁栖湖', 'huairou', '怀柔区', 'park', '🦢', 116.672, 40.394, 210, ['plant', 'sport', 'photo'], '山水景观与滨湖休闲相结合。', ['湖景', '骑行', '远山'], '下午'),

  place('jinhai-lake', '金海湖', 'pinggu', '平谷区', 'park', '🌊', 117.311, 40.187, 240, ['plant', 'sport', 'photo'], '北京东部大型水域与山地休闲区。', ['湖景', '户外', '水上活动'], '全天'),
  place('shilinxia', '京东石林峡', 'pinggu', '平谷区', 'park', '⛰️', 117.254, 40.266, 300, ['plant', 'sport', 'photo'], '峡谷、山地步道与高空观景设施结合。', ['峡谷', '登山', '观景台'], '上午'),

  place('gubei-water-town', '古北水镇', 'miyun', '密云区', 'neighborhood', '🏘️', 117.268, 40.65, 360, ['culture', 'food', 'photo'], '山地长城脚下的度假街区和夜游目的地。', ['夜景', '水镇', '司马台长城'], '下午至夜间', true),
  place('simatai', '司马台长城', 'miyun', '密云区', 'heritage', '🧱', 117.282, 40.658, 240, ['culture', 'sport', 'photo'], '山势险峻、保存特色鲜明的长城段。', ['长城', '登山', '夜游'], '下午'),

  place('badaling', '八达岭长城', 'yanqing', '延庆区', 'heritage', '🧱', 116.016, 40.355, 300, ['culture', 'sport', 'photo'], '交通相对成熟、知名度最高的长城游览区之一。', ['长城', '世界遗产', '山景'], '上午', true),
  place('longqing-gorge', '龙庆峡', 'yanqing', '延庆区', 'park', '🏔️', 116.0, 40.55, 300, ['plant', 'sport', 'photo'], '峡谷、湖面与季节性冰灯活动结合。', ['峡谷', '游船', '冰灯'], '上午'),
  place('beijing-expo-park', '北京世园公园', 'yanqing', '延庆区', 'park', '🌼', 115.973, 40.44, 240, ['plant', 'photo'], '园艺展园与自然景观结合的大型公园。', ['园艺', '植物', '建筑'], '上午'),
];

export const BEIJING_PLACE_MAP = Object.fromEntries(
  BEIJING_PLACES.map((item) => [item.id, item]),
) as Record<string, BeijingPlace>;

const BEIJING_PLACE_ALIASES: Partial<Record<string, string[]>> = {
  'forbidden-city': ['故宫'],
  'national-museum': ['国博'],
  'temple-of-heaven': ['天坛'],
  'beihai-park': ['北海'],
  'olympic-park': ['鸟巢', '水立方', '奥林匹克公园'],
  aosen: ['奥森', '奥林匹克森林公园'],
  'art-798': ['798'],
  'summer-palace': ['颐和园'],
  yuanmingyuan: ['圆明园'],
  'fragrant-hills': ['香山'],
  'national-botanical-garden': ['国家植物园', '北京植物园'],
  'peking-university': ['北大'],
  'tsinghua-university': ['清华'],
  'beijing-jiaotong-university': ['北交大', '北交'],
  'universal-beijing': ['环球影城', '环球度假区'],
  'grand-canal-museum': ['大运河博物馆'],
  'ming-tombs': ['十三陵'],
  'beijing-wildlife-park': ['北京野生动物园'],
  mutianyu: ['慕田峪', '慕田峪长城'],
  simatai: ['司马台', '司马台长城'],
  badaling: ['八达岭', '八达岭长城'],
};

export function aliasesForPlace(item: BeijingPlace): string[] {
  const shortened = item.name.replace(/(博物院|博物馆|遗址公园|森林公园|风景区|公园|大学)$/u, '');
  return Array.from(new Set([
    item.name,
    ...(shortened.length >= 3 ? [shortened] : []),
    ...(BEIJING_PLACE_ALIASES[item.id] ?? []),
  ])).sort((a, b) => b.length - a.length);
}

export function districtIdsFromText(text: string): BeijingDistrictId[] {
  return BEIJING_DISTRICTS.filter((district) =>
    [district.label, ...district.aliases].some((name) => text.includes(name)),
  ).map((district) => district.id);
}

export function beijingPlaceFromText(text: string): BeijingPlace | null {
  return beijingPlacesFromText(text)[0] ?? null;
}

export function beijingPlacesFromText(text: string): BeijingPlace[] {
  return BEIJING_PLACES.filter((item) => aliasesForPlace(item).some((alias) => text.includes(alias)));
}

