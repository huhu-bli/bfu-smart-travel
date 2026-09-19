import { DURATIONS, INTERESTS } from '../data/interests';
import type { PlanOptions, RoutePlan } from '../types';
import { formatDuration } from '../lib/planner';
import { routeScene, type Scene } from '../lib/sceneRouter';
import { runChatLoop, runResponsesLoop } from './toolLoop';
import { requestModel } from './network';
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

export async function runAgentTurn(params: {
  history: AgentHistory;
  userText: string;
  settings: AgentSettings;
  scene?: Scene;
  currentPlan?: RoutePlan | null;
  currentPlanOptions?: PlanOptions | null;
}): Promise<AgentTurnResult> {
  const { history, userText, settings } = params;
  const scene = routeScene(userText, params.scene ?? 'unknown');
  const currentPlan = scene === 'campus-route' ? params.currentPlan ?? null : null;
  const currentPlanOptions = scene === 'campus-route' ? params.currentPlanOptions ?? null : null;
  const context: AgentToolContext = {
    plan: currentPlan,
    planOptions: currentPlanOptions,
    spotIds: [],
    tripIds: [],
    trace: [],
  };
  const contextHint = formatCurrentPlanContext(currentPlan, currentPlanOptions);

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

  return {
    scene,
    text: outcome.text,
    history: outcome.history,
    trimmed: outcome.trimmed,
    plan: context.plan,
    planOptions: context.planOptions,
    spotIds: [...context.spotIds],
    tripIds: [...context.tripIds],
    trace: [...context.trace],
    rounds: outcome.rounds,
  };
}

export function describePlanOption(options: PlanOptions): string {
  const duration = DURATIONS.reduce((closest, item) =>
    Math.abs(item.minutes - options.minutes) < Math.abs(closest.minutes - options.minutes)
      ? item
      : closest,
  );
  const labels = options.interests.length
    ? options.interests.map((id) => INTERESTS.find((item) => item.id === id)?.label ?? id)
    : ['综合'];
  return `${duration.label} · ${labels.join('/')} · ${options.pace.label}节奏`;
}

export function formatPlanSummary(plan: RoutePlan): string {
  return `${plan.title}（${formatDuration(plan.totalMinutes)} / 约 ${plan.totalMeters} 米）`;
}

