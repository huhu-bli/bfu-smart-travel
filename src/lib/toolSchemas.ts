import { GATE_IDS, INTERESTS } from '../data/interests';

/** 工具参数中的枚举来自 data 层，不复制到提示词中，避免提示词和数据重复维护。 */
export const INTEREST_IDS = INTERESTS.map((item) => item.id);

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
          description: '点位 id，可先调用 list_spots 获取。',
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
      '推荐校园周边的校外行程，返回时间轴、预算、交通与提示。用户想「出去玩 / 一日游 / 周末去哪」时调用。',
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
          description: '主题关键词，例如自然、历史、登山、美食。传空字符串表示不限。',
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

export type ToolSchema = (typeof TOOL_SCHEMAS)[number];
