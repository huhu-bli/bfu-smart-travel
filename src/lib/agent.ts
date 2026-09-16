import { DURATIONS, INTERESTS } from '../data/interests';
import type { PlanOptions, RoutePlan } from '../types';
import { promptForScene } from '../prompts/scenePrompts';
import { formatDuration } from './planner';
import { routeScene, sceneTools, type Scene } from './sceneRouter';
import { TOOL_SCHEMAS } from './toolSchemas';
import { runTool } from './toolExecutor';

export { TOOL_SCHEMAS } from './toolSchemas';
export { runTool } from './toolExecutor';

/** 直连 = 浏览器带着自己的 API Key 直接请求；代理 = 请求转发到自建 Serverless，由服务端持钥。 */
export type AgentMode = 'direct' | 'proxy';

/**
 * 两种接口协议：
 * - responses：OpenAI 的 Responses API（工具调用只能用这个）
 * - chat：OpenAI 兼容的 Chat Completions（DeepSeek、通义、智谱、Kimi 等都用这个）
 */
export type AgentProtocol = 'responses' | 'chat';

export type AgentProviderId = 'deepseek' | 'qwen' | 'openai' | 'custom';

export interface AgentProvider {
  id: AgentProviderId;
  label: string;
  protocol: AgentProtocol;
  baseUrl: string;
  model: string;
  models: string[];
  keyHint: string;
  note: string;
}

export const PROVIDERS: AgentProvider[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'chat',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-...',
    note: '国内可直连，浏览器跨域已实测放行。「deepseek-chat」支持工具调用。',
  },
  {
    id: 'qwen',
    label: '通义千问',
    protocol: 'chat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.8-flash',
    models: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus'],
    keyHint: 'sk-...',
    note: '阿里云百炼，国内直连、响应很快。新用户有免费额度（官方页面写明赠送 1 亿+ tokens），额度以控制台为准。',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'responses',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6-astra',
    models: ['gpt-6-astra', 'gpt-5.6', 'gpt-5.4'],
    keyHint: 'sk-...',
    note: '国内网络常无法直连，且部分网络会拦截 POST，建议配代理模式。',
  },
  {
    id: 'custom',
    label: '自定义',
    protocol: 'chat',
    baseUrl: '',
    model: '',
    models: [],
    keyHint: '按服务商要求填写',
    note: '任何 OpenAI 兼容接口都可以，填到 /v1 这一层为止，例如 https://dashscope.aliyuncs.com/compatible-mode/v1。',
  },
];

export function providerOf(id: AgentProviderId): AgentProvider {
  return PROVIDERS.find((item) => item.id === id) ?? PROVIDERS[0];
}

export interface AgentSettings {
  mode: AgentMode;
  provider: AgentProviderId;
  protocol: AgentProtocol;
  apiKey: string;
  /** 接口基地址，切换服务商时会自动填好，也可以手改。 */
  baseUrl: string;
  proxyUrl: string;
  /** 代理模式下的访问口令，对应 Worker 的 APP_TOKEN。前端可见，只用于挡住随手滥用。 */
  proxyToken: string;
  model: string;
}

/**
 * 读取构建时注入的站点级配置（见 index.html）。
 * 变量没配置时 Vite 会保留 %VITE_XXX% 原文，这里按空值处理。
 */
function readSiteEnv(key: string): string {
  const bag = (globalThis as { __BFU_ENV__?: Record<string, unknown> }).__BFU_ENV__;
  const raw = bag?.[key];
  if (typeof raw !== 'string') return '';
  return raw.startsWith('%') ? '' : raw.trim();
}

const SITE_PROXY_URL = readSiteEnv('VITE_AGENT_PROXY_URL');
const SITE_PROXY_TOKEN = readSiteEnv('VITE_AGENT_PROXY_TOKEN');
/** 站方提供的密钥：填了这个，访客不用配任何东西就能直接用 AI（密钥会出现在网页源码里）。 */
const SITE_API_KEY = readSiteEnv('VITE_AGENT_API_KEY');

/** 站点默认服务商：优先用 VITE_AGENT_PROVIDER，其次内置密钥场景默认通义，最后 DeepSeek。 */
const SITE_PROVIDER_ENV = readSiteEnv('VITE_AGENT_PROVIDER');
const SITE_PROVIDER: AgentProviderId =
  SITE_PROVIDER_ENV && PROVIDERS.some((item) => item.id === SITE_PROVIDER_ENV)
    ? (SITE_PROVIDER_ENV as AgentProviderId)
    : SITE_API_KEY
      ? 'qwen'
      : 'deepseek';
const SITE_PRESET = providerOf(SITE_PROVIDER);

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  // 站点已经内置密钥时直接走直连：密钥本来就随网页公开，少一跳反而更稳更快。
  // 没内置密钥但配了代理时，才默认走代理（密钥不出服务端）。
  mode: SITE_API_KEY || !SITE_PROXY_URL ? 'direct' : 'proxy',
  provider: SITE_PROVIDER,
  protocol: SITE_PRESET.protocol,
  // 站点内置了密钥就一定带上：直连模式要靠它，切到代理模式时它只是闲置。
  apiKey: SITE_API_KEY,
  baseUrl: SITE_PRESET.baseUrl,
  proxyUrl: SITE_PROXY_URL,
  proxyToken: SITE_PROXY_TOKEN,
  model: SITE_PRESET.model,
};

/**
 * 站点内置密钥的直连配置：代理不通时（workers.dev 在国内时常抽风）可以兜底。
 * 只有配置了 VITE_AGENT_API_KEY 才存在；注意密钥会随网页公开。
 */
export const SITE_DIRECT_FALLBACK: AgentSettings | null = SITE_API_KEY
  ? {
      mode: 'direct',
      provider: SITE_PROVIDER,
      protocol: SITE_PRESET.protocol,
      apiKey: SITE_API_KEY,
      baseUrl: SITE_PRESET.baseUrl,
      proxyUrl: '',
      proxyToken: '',
      model: SITE_PRESET.model,
    }
  : null;

const DIRECT_BASE = 'https://api.openai.com/v1';
const MAX_ROUNDS = 6;
/** 发给模型的历史最多保留最近这么多轮，避免请求无限增长。 */
const MAX_HISTORY_GROUPS = 10;
/** 历史体积硬上限（字符数），超了继续从最早的轮次开始丢。 */
const MAX_HISTORY_CHARS = 60000;
const REQUEST_TIMEOUT_MS = 60_000;
/** 代理在国内时通时不通，超时设短一点，好尽快切到直连兜底。 */
const PROXY_TIMEOUT_MS = 20_000;

export type AgentInputItem = Record<string, unknown>;

/** Chat Completions 协议下的消息结构。 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

/** 会话历史：Responses 协议存原始 items，Chat 协议存 messages。 */
export type AgentHistory = AgentInputItem[] | ChatMessage[];

export interface ToolCall {
  name: string;
  callId: string;
  arguments: string;
}

export interface AgentToolContext {
  plan: RoutePlan | null;
  planOptions: PlanOptions | null;
  spotIds: string[];
  tripIds: string[];
  trace: string[];
}

export interface AgentTurnResult {
  scene: Scene;
  text: string;
  history: AgentHistory;
  /** 是否因为过长而省略了较早的对话 */
  trimmed: boolean;
  plan: RoutePlan | null;
  planOptions: PlanOptions | null;
  spotIds: string[];
  tripIds: string[];
  trace: string[];
  rounds: number;
}

function formatCurrentPlanContext(plan: RoutePlan | null, options: PlanOptions | null): string {
  if (!plan) return '';
  const stops = plan.stops.map((stop, index) => `${index + 1}. ${stop.spot.name}（id: ${stop.spot.id}）`).join('；');
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

/* ------------------------------------------------------------------ */
/* 请求与解析                                                          */
/* ------------------------------------------------------------------ */

export function resolveEndpoint(settings: AgentSettings): string {
  const path = settings.protocol === 'chat' ? '/chat/completions' : '/responses';
  if (settings.mode === 'proxy') {
    const url = settings.proxyUrl.trim().replace(/\/+$/, '');
    if (!url) throw new Error('还没有填写代理地址。');
    if (!/^https?:\/\//i.test(url)) throw new Error('代理地址需要以 https:// 或 http:// 开头。');
    return `${url}${path}`;
  }
  if (!settings.apiKey.trim()) throw new Error('还没有填写 API Key。');
  return `${resolveBase(settings)}${path}`;
}

/** 直连模式的基地址：留空就用服务商的默认地址。 */
export function resolveBase(settings: AgentSettings): string {
  const custom = (settings.baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!custom) {
    return settings.provider === 'openai' ? DIRECT_BASE : providerOf(settings.provider).baseUrl;
  }
  if (!/^https?:\/\//i.test(custom)) {
    throw new Error('API 地址需要以 https:// 或 http:// 开头。');
  }
  return custom;
}

export function buildRequestPayload(
  settings: AgentSettings,
  input: AgentInputItem[],
  scene: Scene = 'unknown',
  contextHint = '',
): Record<string, unknown> {
  const tools = TOOL_SCHEMAS.filter((tool) => sceneTools(scene).includes(tool.name));
  return {
    model: settings.model.trim() || DEFAULT_AGENT_SETTINGS.model,
    instructions: [promptForScene(scene), contextHint].filter(Boolean).join('\n\n'),
    input,
    tools,
    tool_choice: tools.length ? 'auto' : 'none',
    parallel_tool_calls: false,
  };
}

export function extractToolCalls(response: unknown): ToolCall[] {
  const output = (response as { output?: unknown[] } | null)?.output;
  if (!Array.isArray(output)) return [];
  return output
    .filter(
      (item): item is { type: string; name: string; call_id: string; arguments?: string } =>
        Boolean(item) && (item as { type?: string }).type === 'function_call',
    )
    .map((item) => ({
      name: item.name,
      callId: item.call_id,
      arguments: item.arguments ?? '{}',
    }));
}

export function extractOutputText(response: unknown): string {
  const payload = response as { output_text?: unknown; output?: unknown[] } | null;
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of payload?.output ?? []) {
    const message = item as { type?: string; content?: unknown[] };
    if (message?.type !== 'message' || !Array.isArray(message.content)) continue;
    for (const chunk of message.content) {
      const part = chunk as { type?: string; text?: unknown };
      if (part?.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
  }
  return parts.join('\n').trim();
}

/* ------------------------------------------------------------------ */
/* Chat Completions 适配（DeepSeek / 通义 / 智谱 等 OpenAI 兼容接口）  */
/* ------------------------------------------------------------------ */

/** 统一工具定义转成 Chat Completions 结构；strict 只有 Responses 支持，这里去掉。 */
export function toChatTools(scene: Scene = 'unknown'): Record<string, unknown>[] {
  return TOOL_SCHEMAS.filter((tool) => sceneTools(scene).includes(tool.name)).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function buildChatPayload(
  settings: AgentSettings,
  messages: ChatMessage[],
  scene: Scene = 'unknown',
  contextHint = '',
): Record<string, unknown> {
  const tools = toChatTools(scene);
  return {
    model: settings.model.trim() || providerOf(settings.provider).model,
    messages: [
      { role: 'system', content: [promptForScene(scene), contextHint].filter(Boolean).join('\n\n') },
      ...messages,
    ],
    tools,
    tool_choice: tools.length ? 'auto' : 'none',
    stream: false,
  };
}

export interface ChatTurn {
  text: string;
  toolCalls: ToolCall[];
  rawToolCalls?: NonNullable<ChatMessage['tool_calls']>;
}

export function parseChatResponse(response: unknown): ChatTurn {
  const choices = (response as { choices?: unknown[] } | null)?.choices;
  const message = (Array.isArray(choices) ? choices[0] : null) as
    | { message?: { content?: unknown; tool_calls?: unknown } }
    | null;
  const raw = message?.message;
  const text = typeof raw?.content === 'string' ? raw.content.trim() : '';
  const rawToolCalls = Array.isArray(raw?.tool_calls)
    ? (raw?.tool_calls as NonNullable<ChatMessage['tool_calls']>)
    : undefined;
  const toolCalls: ToolCall[] = (rawToolCalls ?? [])
    .filter((call) => call?.function?.name)
    .map((call) => ({
      name: call.function.name,
      callId: call.id || `call_${call.function.name}`,
      arguments: call.function.arguments ?? '{}',
    }));
  return { text, toolCalls, rawToolCalls };
}

function describeError(status: number, payload: unknown, settings: AgentSettings): string {
  const message = (payload as { error?: { message?: string } } | null)?.error?.message;
  const detail = message ? `：${message}` : '';
  switch (status) {
    case 400:
      return `请求被拒绝（400）${detail}`;
    case 401:
      return settings.mode === 'direct'
        ? `${providerOf(settings.provider).label} 的 API Key 无效或已过期（401），请重新填写。`
        : '代理拒绝了请求（401），检查代理上的密钥或访问口令。';
    case 403:
      return `当前密钥没有访问该模型的权限（403）${detail}`;
    case 404:
      return `模型「${settings.model}」不存在或你的账号不可用（404），可以换成 ${
        providerOf(settings.provider).models.slice(0, 2).join(' / ') || '服务商支持的模型'
      }。`;
    case 429:
      return '触发限流或额度不足（429），稍后再试，或到 OpenAI 后台检查用量与额度。';
    default:
      return `请求失败（${status}）${detail}`;
  }
}

async function requestModel(
  settings: AgentSettings,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const endpoint = resolveEndpoint(settings);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.mode === 'direct') {
    headers.authorization = `Bearer ${settings.apiKey.trim()}`;
  } else if (settings.proxyToken.trim()) {
    headers['x-app-token'] = settings.proxyToken.trim();
  }

  const controller = new AbortController();
  const timeout = settings.mode === 'proxy' ? PROXY_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const timer = globalThis.setTimeout(() => controller.abort(), timeout);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    const hint =
      settings.mode === 'direct'
        ? `如果「测试连接」也失败，说明这台设备访问不了 ${resolveBase(settings).replace(/\/+$/, '')}：常见原因是被网络环境拦截（校园网、公司网、运营商）、浏览器插件拦截，或需要用代理模式。`
        : '请确认代理已部署成功、地址拼写正确，并且设置了 CORS 响应头。';
    throw new Error(
      settings.mode === 'direct'
        ? `网络请求失败：浏览器没能把请求发出去。${hint}`
        : `网络请求失败：代理地址不可达。${hint}`,
    );
  } finally {
    globalThis.clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(describeError(response.status, payload, settings));
  return payload ?? {};
}

/* ------------------------------------------------------------------ */
/* 主循环                                                              */
/* ------------------------------------------------------------------ */

const EMPTY_REPLY = '（模型没有返回文字，换个问法再试一次。）';

function isUserItem(item: unknown): boolean {
  return Boolean(item) && (item as { role?: string }).role === 'user';
}

/** 找出每个「用户提问」在历史里的起始下标 —— 按轮裁剪才不会拆散工具调用与结果。 */
function groupStarts(history: AgentHistory): number[] {
  const starts: number[] = [];
  history.forEach((item, index) => {
    if (isUserItem(item)) starts.push(index);
  });
  return starts;
}

/**
 * 只保留最近若干轮对话：
 * - 按「用户提问」为边界裁剪，保证 function_call / tool 结果不会被拆开
 * - 再按体积兜底裁一次，避免某一轮里工具返回特别大
 */
export function trimHistory(history: AgentHistory): { history: AgentHistory; trimmed: boolean } {
  const starts = groupStarts(history);
  if (starts.length <= MAX_HISTORY_GROUPS && JSON.stringify(history).length <= MAX_HISTORY_CHARS) {
    return { history, trimmed: false };
  }

  let keepFrom = starts.length > MAX_HISTORY_GROUPS ? starts[starts.length - MAX_HISTORY_GROUPS] : 0;
  let slice = history.slice(keepFrom);
  while (slice.length > 2 && JSON.stringify(slice).length > MAX_HISTORY_CHARS) {
    const inner = groupStarts(slice);
    if (inner.length <= 1) break;
    keepFrom = inner[1];
    slice = slice.slice(keepFrom);
  }
  return { history: slice, trimmed: true };
}

interface LoopOutcome {
  text: string;
  history: AgentHistory;
  rounds: number;
  trimmed: boolean;
}

/** Responses API（OpenAI 专用协议）的工具调用循环。 */
async function runResponsesLoop(
  history: AgentInputItem[],
  userText: string,
  settings: AgentSettings,
  context: AgentToolContext,
  scene: Scene,
  contextHint: string,
): Promise<LoopOutcome> {
  const trimmedHistory = trimHistory(history);
  let input: AgentInputItem[] = [
    ...(trimmedHistory.history as AgentInputItem[]),
    { role: 'user', content: userText },
  ];

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = await requestModel(settings, buildRequestPayload(settings, input, scene, contextHint));
    const output = (response.output as AgentInputItem[] | undefined) ?? [];
    input = [...input, ...output];

    const calls = extractToolCalls(response);
    if (!calls.length) {
      return {
        text: extractOutputText(response) || EMPTY_REPLY,
        history: input,
        rounds: round,
        trimmed: trimmedHistory.trimmed,
      };
    }

    for (const call of calls) {
      input.push({
        type: 'function_call_output',
        call_id: call.callId,
        output: runTool(call.name, call.arguments, context),
      });
    }
  }

  throw new Error('工具调用轮次过多，把问题拆小一点再试。');
}

/** Chat Completions（DeepSeek、通义、智谱等 OpenAI 兼容接口）的工具调用循环。 */
async function runChatLoop(
  history: ChatMessage[],
  userText: string,
  settings: AgentSettings,
  context: AgentToolContext,
  scene: Scene,
  contextHint: string,
): Promise<LoopOutcome> {
  const trimmedHistory = trimHistory(history);
  let messages: ChatMessage[] = [...(trimmedHistory.history as ChatMessage[]), { role: 'user', content: userText }];

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = await requestModel(settings, buildChatPayload(settings, messages, scene, contextHint));
    const turn = parseChatResponse(response);

    const assistant: ChatMessage = {
      role: 'assistant',
      content: turn.text || null,
    };
    if (turn.rawToolCalls?.length) assistant.tool_calls = turn.rawToolCalls;
    messages = [...messages, assistant];

    if (!turn.toolCalls.length) {
      return {
        text: turn.text || EMPTY_REPLY,
        history: messages,
        rounds: round,
        trimmed: trimmedHistory.trimmed,
      };
    }

    for (const call of turn.toolCalls) {
      messages.push({
        role: 'tool',
        tool_call_id: call.callId,
        content: runTool(call.name, call.arguments, context),
      });
    }
  }

  throw new Error('工具调用轮次过多，把问题拆小一点再试。');
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
      ? await runChatLoop(history as ChatMessage[], userText, settings, context, scene, contextHint)
      : await runResponsesLoop(history as AgentInputItem[], userText, settings, context, scene, contextHint);

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

/* ------------------------------------------------------------------ */
/* 连接自检                                                            */
/* ------------------------------------------------------------------ */

export interface ProbeResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  message: string;
  detail?: string;
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * 用一把无效密钥试发一次 POST：不花钱，但能判断浏览器到底能不能发出 POST。
 * 很多网络环境（校园网、安全客户端、浏览器插件）会放行 GET、拦掉 POST。
 */
async function probePost(
  base: string,
  path: string,
  model: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; status?: number; detail?: string }> {
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-not-a-real-key-probe',
      },
      body: JSON.stringify({ model: model || 'gpt-5.6', input: 'ping' }),
      signal,
    });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, detail: errorDetail(error) };
  }
}

/**
 * 用一次廉价请求判断「到底是网络不通，还是密钥/配置有问题」。
 * 直连模式打 /models（不会产生生成费用），代理模式打一次 GET。
 */
export async function probeConnection(settings: AgentSettings): Promise<ProbeResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 15_000);

  try {
    if (settings.mode === 'direct') {
      let base: string;
      try {
        base = resolveBase(settings);
      } catch (error) {
        return { ok: false, latencyMs: 0, message: errorDetail(error) };
      }
      if (!settings.apiKey.trim()) {
        return { ok: false, latencyMs: 0, message: '先填写 API Key 再测试。' };
      }

      let response: Response;
      try {
        response = await fetch(`${base}/models`, {
          headers: { authorization: `Bearer ${settings.apiKey.trim()}` },
          signal: controller.signal,
        });
      } catch (error) {
        return {
          ok: false,
          latencyMs: elapsed(),
          message: `连不上 ${base}：这台设备的网络到不了该地址，直连模式用不了。`,
          detail: errorDetail(error),
        };
      }

      const ms = elapsed();

      const postPath = settings.protocol === 'chat' ? '/chat/completions' : '/responses';
      const post = await probePost(base, postPath, settings.model.trim(), controller.signal);
      if (!post.ok) {
        const keyNote =
          response.status === 401 ? '顺带一提，当前密钥也无效（401）。' : '密钥和网络本身是通的。';
        return {
          ok: false,
          status: response.status,
          latencyMs: ms,
          message: `能连上服务器，但浏览器发不出 POST 请求（接口：${postPath}）。直连模式用不了，请改用代理模式。${keyNote}`,
          detail: post.detail,
        };
      }

      if (response.status === 401) {
        return { ok: false, status: 401, latencyMs: ms, message: '网络与跨域都正常，但 API Key 无效或已过期（401）。' };
      }
      if (response.status === 403) {
        return { ok: false, status: 403, latencyMs: ms, message: '网络是通的，但密钥没有权限（403）。' };
      }
      if (response.status === 404) {
        return {
          ok: true,
          status: 200,
          latencyMs: ms,
          message: `连接正常：服务器可达、也能发出 POST 请求（${ms} ms）。该服务商没有 /models 接口，密钥是否有效需要发一条消息才知道。`,
        };
      }
      if (!response.ok) {
        return { ok: false, status: response.status, latencyMs: ms, message: `能连上服务器，但返回 HTTP ${response.status}。` };
      }

      const payload = (await response.json().catch(() => null)) as { data?: { id?: string }[] } | null;
      const ids = (payload?.data ?? [])
        .map((item) => item?.id)
        .filter((id): id is string => typeof id === 'string');
      const model = settings.model.trim();
      if (model && ids.length && !ids.includes(model)) {
        return {
          ok: true,
          status: 200,
          latencyMs: ms,
          message: `网络与密钥都正常（${ms} ms），但可用模型里没有「${model}」，建议换成 ${ids.slice(0, 3).join(' / ')}。`,
        };
      }
      return {
        ok: true,
        status: 200,
        latencyMs: ms,
        message: `连接正常：密钥有效、浏览器也能发出 POST 请求（${ms} ms）。`,
      };
    }

    const url = settings.proxyUrl.trim();
    if (!url) return { ok: false, latencyMs: 0, message: '先填写代理地址再测试。' };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: settings.proxyToken.trim() ? { 'x-app-token': settings.proxyToken.trim() } : {},
        signal: controller.signal,
      });
    } catch (error) {
      return {
        ok: false,
        latencyMs: elapsed(),
        message: `代理地址不可达：${url}`,
        detail: errorDetail(error),
      };
    }

    const ms = elapsed();
    if (response.status === 401) {
      return { ok: false, status: 401, latencyMs: ms, message: '代理可达，但访问口令不正确（401）。' };
    }
    return {
      ok: true,
      status: response.status,
      latencyMs: ms,
      message: `代理可达（HTTP ${response.status}，${ms} ms），并且返回了跨域头。`,
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
}
