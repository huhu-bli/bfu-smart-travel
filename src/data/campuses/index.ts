import { SPOTS } from '../spots';
import type { Spot } from '../../types';
import { BJTU_SPOTS } from './bjtu';

export type CampusId =
  | 'bfu'
  | 'bjtu'
  | 'pku'
  | 'tsinghua'
  | 'ruc'
  | 'buaa'
  | 'bit'
  | 'bnu'
  | 'bupt'
  | 'cau'
  | 'cugb'
  | 'bfsu'
  | 'cufe'
  | 'muc';

export interface CampusDefinition {
  id: CampusId;
  name: string;
  shortName: string;
  aliases: string[];
  weatherLocation: string;
  defaultGateId: string;
  /** 有点位数据才允许调用校园路线工具。 */
  spots?: Spot[];
  /** 当前是否有专用地图适配器；没有时只展示 Agent 文本路线。 */
  mapMode?: 'bfu-svg' | 'haidian-poi';
}

export const CAMPUSES: CampusDefinition[] = [
  {
    id: 'bfu',
    name: '北京林业大学',
    shortName: '北林',
    aliases: ['北京林业大学', '北林', '林大'],
    weatherLocation: '北京林业大学',
    defaultGateId: 'gate-main',
    spots: SPOTS,
    mapMode: 'bfu-svg',
  },
  {
    id: 'bjtu',
    name: '北京交通大学',
    shortName: '北交',
    aliases: ['北京交通大学', '北交大', '北交'],
    weatherLocation: '北京交通大学',
    defaultGateId: 'bjtu-south-gate',
    spots: BJTU_SPOTS,
    mapMode: 'haidian-poi',
  },
  { id: 'pku', name: '北京大学', shortName: '北大', aliases: ['北京大学', '北大'], weatherLocation: '北京大学', defaultGateId: '' },
  { id: 'tsinghua', name: '清华大学', shortName: '清华', aliases: ['清华大学', '清华'], weatherLocation: '清华大学', defaultGateId: '' },
  { id: 'ruc', name: '中国人民大学', shortName: '人大', aliases: ['中国人民大学', '人大'], weatherLocation: '中国人民大学', defaultGateId: '' },
  { id: 'buaa', name: '北京航空航天大学', shortName: '北航', aliases: ['北京航空航天大学', '北航'], weatherLocation: '北京航空航天大学', defaultGateId: '' },
  { id: 'bit', name: '北京理工大学', shortName: '北理工', aliases: ['北京理工大学', '北理工'], weatherLocation: '北京理工大学', defaultGateId: '' },
  { id: 'bnu', name: '北京师范大学', shortName: '北师大', aliases: ['北京师范大学', '北师大'], weatherLocation: '北京师范大学', defaultGateId: '' },
  { id: 'bupt', name: '北京邮电大学', shortName: '北邮', aliases: ['北京邮电大学', '北邮'], weatherLocation: '北京邮电大学', defaultGateId: '' },
  { id: 'cau', name: '中国农业大学', shortName: '中国农大', aliases: ['中国农业大学', '中国农大', '农大'], weatherLocation: '中国农业大学', defaultGateId: '' },
  { id: 'cugb', name: '中国地质大学（北京）', shortName: '地大', aliases: ['中国地质大学（北京）', '中国地质大学北京', '北京地质大学', '地大'], weatherLocation: '中国地质大学北京', defaultGateId: '' },
  { id: 'bfsu', name: '北京外国语大学', shortName: '北外', aliases: ['北京外国语大学', '北外'], weatherLocation: '北京外国语大学', defaultGateId: '' },
  { id: 'cufe', name: '中央财经大学', shortName: '央财', aliases: ['中央财经大学', '央财'], weatherLocation: '中央财经大学', defaultGateId: '' },
  { id: 'muc', name: '中央民族大学', shortName: '民大', aliases: ['中央民族大学', '民大'], weatherLocation: '中央民族大学', defaultGateId: '' },
];

export const CAMPUS_IDS = CAMPUSES.map((campus) => campus.id);

export function campusById(id: string | null | undefined): CampusDefinition | null {
  return CAMPUSES.find((campus) => campus.id === id) ?? null;
}

export function campusByText(text: string): CampusDefinition | null {
  // 先按用户原文位置识别学校，不能按注册表顺序让北林覆盖其他目标。
  const mentions = CAMPUSES.flatMap((campus) => campus.aliases.flatMap((alias) => {
    const matches: Array<{ campus: CampusDefinition; index: number; length: number }> = [];
    for (let index = text.indexOf(alias); index !== -1; index = text.indexOf(alias, index + alias.length)) {
      matches.push({ campus, index, length: alias.length });
    }
    return matches;
  })).sort((a, b) => a.index - b.index || b.length - a.length);
  const candidates: Array<{ campus: CampusDefinition; destination: boolean }> = [];
  let end = -1;
  for (const mention of mentions) {
    if (mention.index < end) continue; // 同一名称只保留最长别名。
    end = mention.index + mention.length;
    const prefix = text.slice(0, mention.index).split(/[，,。.!！?？；;：:\n]/).pop() ?? '';
    // 否定只延续到同一分句；“改去/换成”等新的目的地动作可以解除它。
    const actions = [...prefix.matchAll(/(?:不要|不想|不打算|不准备|不需要|不再|不用|不去|不选|不是|并非|而非|别|排除|跳过|删除|移除|去掉)(?:\s|再|继续|去|用|逛|到|前往|参观|游览|选择|规划|安排|使用|采用|拿|在|以|把|基于|按照|只|仅)*|改去|改成|换去|换成|转去|前往|想去|打算去|计划去|准备去|安排|去|到|选择/g)];
    const action = actions[actions.length - 1];
    if (action && /^(?:不|别|并非|而非|排除|跳过|删除|移除|去掉)/.test(action[0])) continue;
    candidates.push({
      campus: mention.campus,
      destination: Boolean(action && prefix.slice(action.index! + action[0].length).trim() === ''),
    });
  }
  const destinations = candidates.filter((candidate) => candidate.destination);
  return destinations[destinations.length - 1]?.campus ?? candidates[0]?.campus ?? null;
}

export function campusSpotMap(campus: CampusDefinition): Record<string, Spot> {
  return Object.fromEntries((campus.spots ?? []).map((spot) => [spot.id, spot]));
}

export function spotAcrossCampuses(id: string): Spot | null {
  for (const campus of CAMPUSES) {
    const spot = campus.spots?.find((item) => item.id === id);
    if (spot) return spot;
  }
  return null;
}

export function campusForSpot(id: string): CampusDefinition | null {
  return CAMPUSES.find((campus) => campus.spots?.some((spot) => spot.id === id)) ?? null;
}
