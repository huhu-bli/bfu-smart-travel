import { budgetToText, spendingFromText } from '../lib/tripBudget';
import { INTERESTS } from '../data/interests';
import type {
  BeijingRouteOptions,
  BeijingRoutePlan,
  PlanOptions,
  RoutePlan,
} from '../types';
import { formatDuration } from '../lib/planner';
import { routeScene, sceneForTarget, type Scene } from '../lib/sceneRouter';
import {
  targetContext,
  type TravelTarget,
} from '../lib/travelTarget';
import { resolveDatabaseTravelTarget, sameTravelTarget } from '../lib/databaseTravelTarget';
import { runChatLoop, runResponsesLoop } from './toolLoop';
import { requestModel } from './network';
import { ensureCityRoute } from './cityRouteGuard';
import type {
  AgentHistory,
  AgentInputItem,
  AgentSettings,
  AgentToolContext,
  AgentTurnResult,
  ChatMessage,
} from './types';

function formatCurrentPlanContext(plan: RoutePlan | null, options: PlanOptions | null): string {
  if (!plan) return '';
  const stops = plan.stops
    .map((stop, index) => `${index + 1}. ${stop.spot.name}（id: ${stop.spot.id}）`)
    .join('；');
  const optionNote = options
    ? `当前参数：${options.minutes} 分钟，${options.pace.label}步速，出发门岗 ${options.startId}。`
    : '';
  return [
    '当前页面已有一条校园路线。用户说“当前路线 / 刚才那条路线”时，优先基于它调整：',
    `起点：${plan.origin.name}（id: ${plan.origin.id}）。站点：${stops || '暂无站点'}。`,
    optionNote,
    '调整站点时，调用 build_route，并把保留/新增站点放入 include_spot_ids，把要删除的站点放入 exclude_spot_ids。',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatCurrentBeijingPlanContext(
  plan: BeijingRoutePlan | null,
  options: BeijingRouteOptions | null,
): string {
  if (!plan || !options) return '';
  const places = [plan.origin, ...plan.stops.map((stop) => stop.place)]
    .map((place, index) => `${index + 1}. ${place.name}（id: ${place.id}）`)
    .join('；');
  return [
    '当前页面已有一条北京城市路线。用户说“当前路线 / 刚才那条路线”时，优先基于它调整：',
    `当前站点：${places}。`,
    `当前参数：${options.minutes} 分钟，${options.pace.label}节奏，交通偏好 ${options.travelMode}。`,
    budgetToText(plan, options.spending),
    '调整站点时调用 build_beijing_route：保留/新增点位放入 include_place_ids，删除点位放入 exclude_place_ids。',
  ].join('\n');
}

export async function runAgentTurn(params: {
  history: AgentHistory;
  userText: string;
  settings: AgentSettings;
  scene?: Scene;
  previousTarget?: TravelTarget | null;
  currentPlan?: RoutePlan | null;
  currentPlanOptions?: PlanOptions | null;
  currentBeijingPlan?: BeijingRoutePlan | null;
  currentBeijingPlanOptions?: BeijingRouteOptions | null;
}): Promise<AgentTurnResult> {
  const { userText, settings } = params;
  const target = await resolveDatabaseTravelTarget(userText, params.previousTarget);
  // 前端尚未识别的新点位可能改变场景；不要把旧校园历史传入城市工具循环。
  const history = sameTravelTarget(target, params.previousTarget) ? params.history : [];
  const routedScene = routeScene(userText, params.scene ?? 'unknown');
  const scene = sceneForTarget(routedScene, target);
  const planCampusId = params.currentPlanOptions?.campusId ?? 'bfu';
  const sameCampus = target.kind === 'campus' && target.campusId === planCampusId;
  const currentPlan = scene === 'campus-route' && sameCampus ? params.currentPlan ?? null : null;
  const currentPlanOptions = scene === 'campus-route' && sameCampus
    ? params.currentPlanOptions ?? null
    : null;
  const currentBeijingPlan = scene === 'outside-trip' ? params.currentBeijingPlan ?? null : null;
  const currentBeijingPlanOptions = scene === 'outside-trip'
    ? params.currentBeijingPlanOptions ?? null
    : null;
  const context: AgentToolContext = {
    target,
    plan: currentPlan,
    planOptions: currentPlanOptions,
    beijingPlan: currentBeijingPlan,
    beijingPlanOptions: currentBeijingPlanOptions,
    spotIds: [],
    placeIds: [],
    tripIds: [],
    trace: [],
  };
  const requestedSpending = spendingFromText(userText);
  context.requestedSpending = requestedSpending;
  if (context.beijingPlanOptions) context.beijingPlanOptions = { ...context.beijingPlanOptions,
    spending: { ...context.beijingPlanOptions.spending, ...requestedSpending } };
  const contextHint = [
    targetContext(target),
    formatCurrentPlanContext(currentPlan, currentPlanOptions),
    formatCurrentBeijingPlanContext(context.beijingPlan, context.beijingPlanOptions),
  ].filter(Boolean).join('\n\n');

  const outcome =
    settings.protocol === 'chat'
      ? await runChatLoop(
          history as ChatMessage[],
          userText,
          settings,
          context,
          scene,
          contextHint,
          requestModel,
        )
      : await runResponsesLoop(
          history as AgentInputItem[],
          userText,
          settings,
          context,
          scene,
          contextHint,
          requestModel,
        );

  const routeText = scene === 'outside-trip'
    ? await ensureCityRoute(userText, outcome.text, context)
    : outcome.text;
  const text = scene === 'outside-trip' && context.beijingPlan && Object.keys(requestedSpending).length && !routeText.includes('门票与金额预算（')
    ? `${routeText}\n\n${budgetToText(context.beijingPlan, context.beijingPlanOptions?.spending)}` : routeText;
  if (text !== outcome.text) {
    // 后续追问只能看到真实工具结果；旧的错误结论不可留在上下文里。
    const last = outcome.history[outcome.history.length - 1] as ChatMessage | AgentInputItem;
    if (last?.role === 'assistant' && !('tool_calls' in last)) {
      last.content = text;
    } else {
      (outcome.history as AgentInputItem[]).push({ role: 'assistant', content: text });
    }
  }

  return {
    scene,
    target,
    text,
    history: outcome.history,
    trimmed: outcome.trimmed,
    plan: context.plan,
    planOptions: context.planOptions,
    beijingPlan: context.beijingPlan,
    beijingPlanOptions: context.beijingPlanOptions,
    spotIds: [...context.spotIds],
    placeIds: [...context.placeIds],
    tripIds: [...context.tripIds],
    trace: [...context.trace],
    rounds: outcome.rounds,
  };
}

export function describePlanOption(options: PlanOptions): string {
  const labels = options.interests.length
    ? options.interests.map((id) => INTERESTS.find((item) => item.id === id)?.label ?? id)
    : ['综合'];
  return `${formatDuration(options.minutes)} · ${labels.join('/')} · ${options.pace.label}节奏`;
}

export function formatPlanSummary(plan: RoutePlan): string {
  return `${plan.title}（${formatDuration(plan.totalMinutes)} / 约 ${plan.totalMeters} 米）`;
}

export function describeBeijingPlanOption(options: BeijingRouteOptions): string {
  const labels = options.interests.length
    ? options.interests.map((id) => INTERESTS.find((item) => item.id === id)?.label ?? id)
    : ['综合'];
  return `${formatDuration(options.minutes)} · ${labels.join('/')} · ${options.pace.label}节奏`;
}

export function formatBeijingPlanSummary(plan: BeijingRoutePlan): string {
  return `${plan.title}（${formatDuration(plan.totalMinutes)} / 点位间约 ${plan.totalDistanceKm} 公里）`;
}
