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
  return (
    CAMPUSES.find((campus) =>
      [...campus.aliases].sort((a, b) => b.length - a.length).some((alias) => text.includes(alias)),
    ) ?? null
  );
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
