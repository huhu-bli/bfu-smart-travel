import type { AgentHistory, ChatMessage } from '../agent/types';
import { CAMPUSES } from '../data/campuses';
import { BEIJING_DISTRICTS } from '../data/beijingPlaces';
import { BEIJING_TARGET, type TravelTarget } from './travelTarget';
import type { Scene } from './sceneRouter';
import { decodeStoredGlobalRoute } from './storedState';
import type { BeijingRouteOptions, BeijingRoutePlan, PlanOptions, RoutePlan } from '../types';

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  plan?: RoutePlan | null;
  planOptions?: PlanOptions | null;
  beijingPlan?: BeijingRoutePlan | null;
  beijingPlanOptions?: BeijingRouteOptions | null;
  spotIds?: string[];
  placeIds?: string[];
  tripIds?: string[];
  trace?: string[];
  isError?: boolean;
  offline?: boolean;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100 && v.every((s) => typeof s === 'string' && s.length <= 3000);
const scenes: Scene[] = ['campus-route', 'spot-detail', 'outside-trip', 'weather', 'system-help', 'unknown'];
export function chatConversationKey(scene: Scene, target: TravelTarget): string {
  return `${scene}:${target.kind === 'campus' ? target.campusId : target.districtIds?.join('-') || 'beijing'}`;
}
function validHistory(v: unknown): v is ChatMessage[] {
  if (!Array.isArray(v) || v.length > 300 || JSON.stringify(v).length > 120000) return false;
  return v.every((m) => record(m) && typeof m.role === 'string' && ['user', 'assistant', 'tool'].includes(m.role) &&
    (typeof m.content === 'string' || m.role === 'assistant' && m.content === null) &&
    (m.role !== 'tool' || typeof m.tool_call_id === 'string') &&
    (m.tool_calls === undefined || Array.isArray(m.tool_calls) && m.tool_calls.length <= 20 && m.tool_calls.every((c) =>
      record(c) && typeof c.id === 'string' && c.type === 'function' && record(c.function) &&
      typeof c.function.name === 'string' && typeof c.function.arguments === 'string')));
}
function validTarget(v: unknown): v is TravelTarget {
  return record(v) && typeof v.kind === 'string' && ['city', 'district', 'campus'].includes(v.kind) &&
    typeof v.label === 'string' && typeof v.routeSupported === 'boolean' && typeof v.explicit === 'boolean' &&
    (v.kind !== 'campus' || CAMPUSES.some((c) => c.id === v.campusId)) &&
    (v.districtIds === undefined || strings(v.districtIds) && v.districtIds.every((id) => BEIJING_DISTRICTS.some((d) => d.id === id)));
}
function decodeTurn(v: unknown): ChatTurn | undefined {
  if (!record(v) || typeof v.id !== 'string' || typeof v.role !== 'string' || !['user', 'assistant'].includes(v.role) || typeof v.text !== 'string') return;
  const turn: ChatTurn = { id: v.id, role: v.role as ChatTurn['role'], text: v.text };
  for (const key of ['spotIds', 'placeIds', 'tripIds', 'trace'] as const) if (strings(v[key])) turn[key] = v[key];
  for (const key of ['isError', 'offline'] as const) if (typeof v[key] === 'boolean') turn[key] = v[key];
  for (const city of [false, true]) {
    const plan = v[city ? 'beijingPlan' : 'plan'];
    const options = v[city ? 'beijingPlanOptions' : 'planOptions'];
    const decoded = decodeStoredGlobalRoute({ kind: city ? 'beijing' : 'campus', plan, options,
      source: 'agent', updatedAt: '2026-01-01T00:00:00Z' });
    if (decoded?.kind === 'beijing') { turn.beijingPlan = decoded.plan; turn.beijingPlanOptions = decoded.options; }
    else if (decoded?.kind === 'campus') { turn.plan = decoded.plan; turn.planOptions = decoded.options; }
  }
  return turn;
}

/** 缓存损坏时保留有效文字，丢弃不可渲染卡片或无效模型历史，不影响全局路线。 */
export function restoreChat(raw: string | null) {
  if (!raw || raw.length > 2000000) return;
  let saved: unknown;
  try { saved = JSON.parse(raw); } catch { return; }
  if (!record(saved) || saved.protocol !== 'chat' || !Array.isArray(saved.turns)) return;
  const turns = saved.turns.slice(-30).map(decodeTurn).filter((v): v is ChatTurn => !!v)
    .map((turn, index) => ({ ...turn, id: `restored-turn-${index}` }));
  const scene: Scene = scenes.includes(saved.activeScene as Scene) ? saved.activeScene as Scene : 'unknown';
  const target = validTarget(saved.activeTarget) ? saved.activeTarget : BEIJING_TARGET;
  const key = chatConversationKey(scene, target);
  const histories: Record<string, AgentHistory> = {};
  if (record(saved.histories)) for (const [name, history] of Object.entries(saved.histories).slice(-30)) {
    if (/^(campus-route|spot-detail|outside-trip|weather|system-help|unknown):[a-z0-9-]+$/.test(name) && validHistory(history)) histories[name] = history;
  }
  const history = histories[key] ?? (validHistory(saved.history) ? saved.history : []);
  return { turns, scene, target, key, histories, history };
}
