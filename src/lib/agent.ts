import { DURATIONS, GATE_IDS, INTERESTS, PACES } from '../data/interests';
import { SPOTS, SPOT_MAP } from '../data/spots';
import { TRIPS } from '../data/trips';
import type { InterestId, PaceId, PlanOptions, RoutePlan } from '../types';
import { buildRoute, formatClock, formatDuration } from './planner';

/** 直连 = 浏览器带着自己的 API Key 直接请求；代理 = 请求转发到自建 Serverless，由服务端持钥。 */
export type AgentMode = 'direct' | 'proxy';

/**
 * 两种接口协议：
 * - responses：OpenAI 的 Responses API（工具调用只能用这个）
 * - chat：OpenAI 兼容的 Chat Completions（DeepSeek、通义、智谱、Kimi 等都用这个）
 */
export type AgentProtocol = 'responses' | 'chat';

export type AgentProviderId = 'deepseek' | 'openai' | 'custom';

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

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  mode: 'direct',
  provider: 'deepseek',
  protocol: 'chat',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  proxyUrl: '',
  proxyToken: '',
  model: 'deepseek-chat',
};

const DIRECT_BASE = 'https://api.openai.com/v1';
const MAX_ROUNDS = 6;
const REQUEST_TIMEOUT_MS = 60_000;

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
  text: string;
  history: AgentHistory;
  plan: RoutePlan | null;
  planOptions: PlanOptions | null;
  spotIds: string[];
  tripIds: string[];
  trace: string[];
  rounds: number;
}

/* ------------------------------------------------------------------ */
/* 工具定义                                                            */
/* ------------------------------------------------------------------ */

const INTEREST_IDS = INTERESTS.map((item) => item.id);

const INTEREST_REFERENCE = INTERESTS.map(
  (item) => `${item.id}=${item.label}`,
).join('、');

const GATE_REFERENCE = GATE_IDS.map((id) => {
  const spot = SPOT_MAP[id];
  return `${id}=${spot ? spot.name : id}`;
}).join('、');

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    name: 'list_spots',
    description:
      '查询校园点位列表。需要知道有哪些点位、某个点位的 id，或按兴趣/关键词筛选点位时调用。返回精简字段，不含完整讲解。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        interests: {
          type: 'array',
          items: { type: 'string', enum: INTEREST_IDS },
          description: '兴趣方向过滤。传空数组表示不限。',
        },
        keyword: {
          type: 'string',
          description: '关键词，匹配名称、简介或亮点。传空字符串表示不过滤。',
        },
      },
      required: ['interests', 'keyword'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'build_route',
    description:
      '按兴趣、可用时长、步速和出发门岗生成一条校园游览路线，返回有序站点、到达/离开时间、步行距离与推荐理由。用户提出「规划路线 / 多长时间怎么逛」时调用。不要自己编造点位和时间。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        interests: {
          type: 'array',
          items: { type: 'string', enum: INTEREST_IDS },
          description: '用户的兴趣方向，可多选。传空数组表示按默认综合兴趣推荐。',
        },
        minutes: {
          type: 'integer',
          description: '可用总时长（分钟），常见取值 30 / 60 / 120 / 240。',
        },
        pace: {
          type: 'string',
          enum: ['easy', 'normal', 'packed'],
          description: '步速节奏：easy=悠闲，normal=标准，packed=紧凑。',
        },
        start_gate: {
          type: 'string',
          enum: GATE_IDS,
          description: '出发门岗。',
        },
      },
      required: ['interests', 'minutes', 'pace', 'start_gate'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_spot_detail',
    description:
      '获取某个校园点位的完整讲解、亮点、最佳观赏时段与小贴士。用户问「这里值得去吗 / 这是什么地方」时调用。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        spot_id: {
          type: 'string',
          description: '点位 id，例如 ginkgo-avenue。可先调用 list_spots 获取。',
        },
      },
      required: ['spot_id'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'suggest_trip',
    description:
      '推荐校园周边的校外行程（奥林匹克森林公园、圆明园、颐和园、香山、鹫峰实验林场、五道口等），返回时间轴、预算、交通与提示。用户想「出去玩 / 一日游 / 周末去哪」时调用。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        duration: {
          type: 'string',
          enum: ['half', 'full'],
          description: 'half=半天，full=一整天。',
        },
        theme: {
          type: 'string',
          description: '主题关键词，例如 自然、历史、登山、美食。传空字符串表示不限。',
        },
        budget_max: {
          type: 'integer',
          description: '人均预算上限（元）。传 0 表示不限。',
        },
      },
      required: ['duration', 'theme', 'budget_max'],
      additionalProperties: false,
    },
  },
] as const;

export const SYSTEM_INSTRUCTIONS = [
  '你是「北林智能旅行」的行程助手，服务对象是来北京林业大学（北林）校园游览或想在学校周边出行的学生和访客。',
  `可用兴趣 id：${INTEREST_REFERENCE}。`,
  `可用门岗 id：${GATE_REFERENCE}。`,
  '规则：',
  '1. 涉及校园路线时必须调用 build_route，涉及点位介绍时调用 get_spot_detail，涉及校外行程时调用 suggest_trip；不确定点位 id 就先调用 list_spots。',
  '2. 时间、距离、顺序一律来自工具返回结果，不要自行编造或改写数字。',
  '3. 用中文回答，先给结论，再给理由；控制在 200 字以内，需要展开时用短列表。',
  '4. 所有数据都是示意数据：提到开放时间、票价、入校政策时，提醒以学校和景区最新公告为准。',
  '5. 如果用户没说清楚兴趣或时长，可以先按常见组合给一版，并在末尾用一句话询问是否要调整。',
].join('\n');

/* ------------------------------------------------------------------ */
/* 工具执行                                                            */
/* ------------------------------------------------------------------ */

function asStringArray(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && allowed.includes(item),
  );
}

function resolveSpotId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (SPOT_MAP[value]) return value;
  const lowered = value.toLowerCase();
  const byId = SPOTS.find((spot) => spot.id.toLowerCase() === lowered);
  if (byId) return byId.id;
  const byName = SPOTS.find(
    (spot) => spot.name === value || spot.name.includes(value) || value.includes(spot.name),
  );
  return byName ? byName.id : null;
}

export function runTool(
  name: string,
  rawArguments: string,
  context: AgentToolContext,
): string {
  let args: Record<string, unknown> = {};
  try {
    args = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: '参数不是合法 JSON，请重新调用。' });
  }

  if (name === 'list_spots') {
    const interests = asStringArray(args.interests, INTEREST_IDS);
    const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
    const matched = SPOTS.filter((spot) => {
      if (spot.kind === '入口') return false;
      const hitInterest = interests.length === 0 || spot.interests.some((id) => interests.includes(id));
      const hitKeyword =
        !keyword ||
        spot.name.includes(keyword) ||
        spot.short.includes(keyword) ||
        spot.highlights.some((highlight) => highlight.includes(keyword));
      return hitInterest && hitKeyword;
    });
    context.trace.push(`list_spots(${matched.length} 个点位)`);
    return JSON.stringify({
      count: matched.length,
      spots: matched.slice(0, 12).map((spot) => ({
        id: spot.id,
        name: spot.name,
        kind: spot.kind,
        short: spot.short,
        bestTime: spot.bestTime,
        interests: spot.interests,
      })),
    });
  }

  if (name === 'build_route') {
    const interests = asStringArray(args.interests, INTEREST_IDS) as InterestId[];
    const rawMinutes = typeof args.minutes === 'number' ? args.minutes : Number(args.minutes);
    const minutes = Number.isFinite(rawMinutes) ? Math.min(480, Math.max(15, Math.round(rawMinutes))) : 60;
    const paceId = (typeof args.pace === 'string' && PACES.some((p) => p.id === args.pace)
      ? args.pace
      : 'normal') as PaceId;
    const pace = PACES.find((item) => item.id === paceId) ?? PACES[1];
    const startId =
      typeof args.start_gate === 'string' && GATE_IDS.includes(args.start_gate)
        ? args.start_gate
        : 'east-gate';

    const options: PlanOptions = { interests, minutes, pace, startId };
    const plan = buildRoute(SPOTS, options);
    context.plan = plan;
    context.planOptions = options;
    context.trace.push(`build_route(${plan.stops.length} 站 / ${Math.round(plan.totalMinutes)} 分钟)`);

    return JSON.stringify({
      title: plan.title,
      subtitle: plan.subtitle,
      origin: plan.origin.name,
      totalMinutes: Math.round(plan.totalMinutes),
      totalMeters: plan.totalMeters,
      stops: plan.stops.map((stop, index) => ({
        order: index + 1,
        name: stop.spot.name,
        spotId: stop.spot.id,
        arrive: formatClock(stop.arrive),
        leave: formatClock(stop.leave),
        walkMinutes: stop.walkMinutes,
        reason: stop.reason,
      })),
      note: '时间与距离为示意估算，出行前请确认开放情况。',
    });
  }

  if (name === 'get_spot_detail') {
    const id = resolveSpotId(args.spot_id);
    if (!id) {
      context.trace.push('get_spot_detail(未找到)');
      return JSON.stringify({
        error: '没有找到这个点位，请先调用 list_spots 获取正确的 spot_id。',
        candidates: SPOTS.filter((spot) => spot.kind !== '入口')
          .slice(0, 8)
          .map((spot) => ({ id: spot.id, name: spot.name })),
      });
    }
    const spot = SPOT_MAP[id];
    if (!context.spotIds.includes(id)) context.spotIds.push(id);
    context.trace.push(`get_spot_detail(${spot.name})`);
    return JSON.stringify({
      id: spot.id,
      name: spot.name,
      kind: spot.kind,
      description: spot.description,
      highlights: spot.highlights,
      bestTime: spot.bestTime,
      visitMinutes: spot.visit,
      tips: spot.tips ?? '',
    });
  }

  if (name === 'suggest_trip') {
    const duration = args.duration === 'full' ? 'full' : 'half';
    const theme = typeof args.theme === 'string' ? args.theme.trim() : '';
    const budget = typeof args.budget_max === 'number' ? args.budget_max : Number(args.budget_max) || 0;

    const wantsFullDay = duration === 'full';
    const matched = TRIPS.filter((trip) => {
      const durationHit = wantsFullDay
        ? trip.duration.includes('一天')
        : trip.duration.includes('半天');
      const themeHit =
        !theme ||
        trip.theme.includes(theme) ||
        trip.summary.includes(theme) ||
        trip.name.includes(theme) ||
        trip.tips.some((tip) => tip.includes(theme));
      return durationHit && themeHit;
    });
    const shortlisted = (matched.length ? matched : TRIPS).slice(0, 3);
    shortlisted.forEach((trip) => {
      if (!context.tripIds.includes(trip.id)) context.tripIds.push(trip.id);
    });
    context.trace.push(`suggest_trip(${shortlisted.length} 条线路)`);

    return JSON.stringify({
      budgetMax: budget,
      trips: shortlisted.map((trip) => ({
        id: trip.id,
        name: trip.name,
        theme: trip.theme,
        duration: trip.duration,
        budget: trip.budget,
        transport: trip.transport,
        bestSeason: trip.bestSeason,
        summary: trip.summary,
        timeline: trip.timeline,
        tips: trip.tips,
      })),
    });
  }

  context.trace.push(`${name}(未知工具)`);
  return JSON.stringify({ error: `未知工具：${name}` });
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
): Record<string, unknown> {
  return {
    model: settings.model.trim() || DEFAULT_AGENT_SETTINGS.model,
    instructions: SYSTEM_INSTRUCTIONS,
    input,
    tools: TOOL_SCHEMAS,
    tool_choice: 'auto',
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
export function toChatTools(): Record<string, unknown>[] {
  return TOOL_SCHEMAS.map((tool) => ({
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
): Record<string, unknown> {
  return {
    model: settings.model.trim() || providerOf(settings.provider).model,
    messages: [{ role: 'system', content: SYSTEM_INSTRUCTIONS }, ...messages],
    tools: toChatTools(),
    tool_choice: 'auto',
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
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

interface LoopOutcome {
  text: string;
  history: AgentHistory;
  rounds: number;
}

/** Responses API（OpenAI 专用协议）的工具调用循环。 */
async function runResponsesLoop(
  history: AgentInputItem[],
  userText: string,
  settings: AgentSettings,
  context: AgentToolContext,
): Promise<LoopOutcome> {
  let input: AgentInputItem[] = [...history, { role: 'user', content: userText }];

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = await requestModel(settings, buildRequestPayload(settings, input));
    const output = (response.output as AgentInputItem[] | undefined) ?? [];
    input = [...input, ...output];

    const calls = extractToolCalls(response);
    if (!calls.length) {
      return { text: extractOutputText(response) || EMPTY_REPLY, history: input, rounds: round };
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
): Promise<LoopOutcome> {
  let messages: ChatMessage[] = [...history, { role: 'user', content: userText }];

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = await requestModel(settings, buildChatPayload(settings, messages));
    const turn = parseChatResponse(response);

    const assistant: ChatMessage = {
      role: 'assistant',
      content: turn.text || null,
    };
    if (turn.rawToolCalls?.length) assistant.tool_calls = turn.rawToolCalls;
    messages = [...messages, assistant];

    if (!turn.toolCalls.length) {
      return { text: turn.text || EMPTY_REPLY, history: messages, rounds: round };
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
}): Promise<AgentTurnResult> {
  const { history, userText, settings } = params;
  const context: AgentToolContext = {
    plan: null,
    planOptions: null,
    spotIds: [],
    tripIds: [],
    trace: [],
  };

  const outcome =
    settings.protocol === 'chat'
      ? await runChatLoop(history as ChatMessage[], userText, settings, context)
      : await runResponsesLoop(history as AgentInputItem[], userText, settings, context);

  return {
    text: outcome.text,
    history: outcome.history,
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
