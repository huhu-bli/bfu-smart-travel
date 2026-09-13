import type { DurationOption, Interest, PaceOption, Spot } from '../types';

export const INTERESTS: Interest[] = [
  { id: 'plant', label: '园林植物', emoji: '🌿', desc: '专类园、苗木与温室' },
  { id: 'culture', label: '建筑人文', emoji: '🏛️', desc: '老建筑、校史与场馆' },
  { id: 'research', label: '科研学术', emoji: '🔬', desc: '重点实验室与标本馆' },
  { id: 'sport', label: '运动休闲', emoji: '🏃', desc: '体育馆与运动场' },
  { id: 'food', label: '美食生活', emoji: '🍚', desc: '食堂与校园生活区' },
  { id: 'photo', label: '摄影打卡', emoji: '📷', desc: '出片机位与季节限定' },
];

export const INTEREST_MAP: Record<string, Interest> = Object.fromEntries(
  INTERESTS.map((item) => [item.id, item]),
);

export const DURATIONS: DurationOption[] = [
  { id: '30', label: '30 分钟', minutes: 30, desc: '课间小转，只看精华' },
  { id: '60', label: '1 小时', minutes: 60, desc: '一次深度的短途漫步' },
  { id: '120', label: '2 小时', minutes: 120, desc: '主景观 + 一个主题区' },
  { id: '240', label: '半天', minutes: 240, desc: '把校园走透' },
];

export const PACES: PaceOption[] = [
  { id: 'easy', label: '悠闲', desc: '边走边拍，多留停留时间', speed: 0.85, dwell: 1.2 },
  { id: 'normal', label: '标准', desc: '常规步速，节奏舒适', speed: 1, dwell: 1 },
  { id: 'packed', label: '紧凑', desc: '快步多看点，时间优先', speed: 1.25, dwell: 0.85 },
];

/** 出发门岗，用于计算起点。 */
export const GATE_IDS = ['gate-main', 'gate-north', 'gate-southeast', 'gate-southwest'];

export function gatesOf(spots: Spot[]): Spot[] {
  return GATE_IDS.map((id) => spots.find((spot) => spot.id === id)).filter(
    (spot): spot is Spot => Boolean(spot),
  );
}
