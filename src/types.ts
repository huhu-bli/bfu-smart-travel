export type InterestId = 'plant' | 'culture' | 'research' | 'sport' | 'food' | 'photo';

export type SpotKind = '入口' | '景观' | '建筑' | '场馆' | '科研' | '绿地' | '运动' | '餐饮';

export interface Interest {
  id: InterestId;
  label: string;
  emoji: string;
  desc: string;
}

export interface Spot {
  id: string;
  name: string;
  kind: SpotKind;
  emoji: string;
  /** 示意图坐标，画布为 1000 x 620 */
  x: number;
  y: number;
  /** 建议停留分钟数 */
  visit: number;
  interests: InterestId[];
  short: string;
  description: string;
  highlights: string[];
  bestTime: string;
  tips?: string;
  mustSee?: boolean;
}

export interface RouteStop {
  spot: Spot;
  /** 相对出发时刻的到达分钟数 */
  arrive: number;
  /** 相对出发时刻的离开分钟数 */
  leave: number;
  /** 从上一站步行过来的分钟数 */
  walkMinutes: number;
  /** 从上一站步行过来的距离（米，示意值） */
  walkMeters: number;
  /** 推荐理由 */
  reason: string;
}

export interface PaceOption {
  id: 'easy' | 'normal' | 'packed';
  label: string;
  desc: string;
  /** 步行速度倍率，越大越快 */
  speed: number;
  /** 参观时长倍率 */
  dwell: number;
}

export type PaceId = PaceOption['id'];

export interface DurationOption {
  id: string;
  label: string;
  minutes: number;
  desc: string;
}

export interface PlanOptions {
  interests: InterestId[];
  minutes: number;
  pace: PaceOption;
  startId: string;
}

export interface RoutePlan {
  title: string;
  subtitle: string;
  origin: Spot;
  stops: RouteStop[];
  totalMinutes: number;
  totalMeters: number;
  matchedInterests: InterestId[];
  pace: PaceOption;
}

export interface TripStep {
  time: string;
  title: string;
  detail: string;
}

export interface Trip {
  id: string;
  name: string;
  emoji: string;
  theme: string;
  duration: string;
  budget: string;
  transport: string;
  bestSeason: string;
  summary: string;
  timeline: TripStep[];
  tips: string[];
}
