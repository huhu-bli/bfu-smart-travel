import { campusByText, type CampusId } from '../data/campuses';

export interface TravelTarget {
  kind: 'district' | 'campus';
  label: string;
  campusId?: CampusId;
  routeSupported: boolean;
  explicit: boolean;
}

export const HAIDIAN_TARGET: TravelTarget = {
  kind: 'district',
  label: '海淀区',
  routeSupported: true,
  explicit: false,
};

const DISTRICT_TERMS = /(海淀区|海淀|颐和园|圆明园|香山|五道口|中关村|西山|玉渊潭|国家图书馆|北京植物园)/;

/**
 * 目的地解析独立于大模型。显式学校名称具有最高优先级，防止模型把其他学校
 * 错误回退为北林；追问没有再次提地点时沿用上一轮目标。
 */
export function resolveTravelTarget(text: string, previous?: TravelTarget | null): TravelTarget {
  const campus = campusByText(text);
  if (campus) {
    return {
      kind: 'campus',
      label: campus.name,
      campusId: campus.id,
      routeSupported: Boolean(campus.spots?.length),
      explicit: true,
    };
  }
  if (DISTRICT_TERMS.test(text)) {
    return { ...HAIDIAN_TARGET, explicit: true };
  }
  if (previous) return { ...previous, explicit: false };
  return HAIDIAN_TARGET;
}

export function targetContext(target: TravelTarget): string {
  if (target.kind === 'district') {
    return '本轮目标范围：海淀区综合旅行。不要调用校园内部路线工具。';
  }
  if (!target.routeSupported) {
    return `本轮目标校园：${target.label}。当前没有该校的校内点位数据，禁止调用 build_route、禁止用北林路线替代；请明确说明暂未支持详细校内规划，并建议用户在海淀综合地图中查看位置。`;
  }
  return `本轮目标校园：${target.label}（campus_id=${target.campusId}）。调用校园工具时必须使用这个 campus_id，绝不能替换成其他学校。`;
}
