/** 对话场景。场景决定当前请求可以看到哪些提示词、工具和上下文。 */
export type Scene = 'campus-route' | 'spot-detail' | 'outside-trip' | 'system-help' | 'unknown';

export type SceneToolName = 'list_spots' | 'build_route' | 'get_spot_detail' | 'suggest_trip';

export interface SceneConfig {
  label: string;
  instruction: string;
  tools: SceneToolName[];
}

export const SCENE_CONFIG: Record<Exclude<Scene, 'unknown'>, SceneConfig> = {
  'campus-route': {
    label: '校园路线',
    instruction: '当前只处理北林校园内的路线规划、时间预算、兴趣和出发门岗。',
    tools: ['list_spots', 'build_route'],
  },
  'spot-detail': {
    label: '点位讲解',
    instruction: '当前只处理北林校园点位查询和点位介绍，不主动生成完整路线。',
    tools: ['list_spots', 'get_spot_detail'],
  },
  'outside-trip': {
    label: '校外旅行',
    instruction: '当前只处理学校周边和校外线路推荐，不调用校园路线工具。',
    tools: ['suggest_trip'],
  },
  'system-help': {
    label: '使用帮助',
    instruction: '当前只解释助手的功能、使用方法和数据边界，不调用旅行工具。',
    tools: [],
  },
};

const HELP = /(你好|您好|hi|hello|在吗|帮助|怎么用|如何使用|能做什么|你是谁|连接失败|api\s*key|密钥|设置)/i;
const OUTSIDE = /(校外|学校外|周边|出去玩|一日游|半天玩|半天游|周末去哪|去哪玩|公园|颐和园|圆明园|香山|奥森|奥林匹克|五道口|鹫峰|爬山|远一点|出学校|地铁|公交)/;
const ROUTE = /(路线|规划|怎么逛|游览|出发|经过|安排|分钟|小时|门岗|东门|南门|北门|西门|想看|兴趣)/;
const DETAIL = /(值得|怎么样|好不好|是什么|介绍|讲讲|说说|开放|几点|好玩|详情|详细|看看)/;
const FOLLOW_UP = /(换|改成|调整|再安排|继续|第二站|第一站|上一条|刚才|它|这个|该点)/;

/** 判断一句话属于哪个场景；无法确定时不强行猜测。 */
export function routeScene(text: string, currentScene: Scene = 'unknown'): Scene {
  const value = text.trim();
  if (!value) return 'unknown';
  if (HELP.test(value)) return 'system-help';
  if (OUTSIDE.test(value)) return 'outside-trip';
  if (ROUTE.test(value)) return 'campus-route';
  if (DETAIL.test(value)) return 'spot-detail';
  if (currentScene !== 'unknown' && FOLLOW_UP.test(value)) return currentScene;
  return 'unknown';
}

export function sceneLabel(scene: Scene): string {
  return scene === 'unknown' ? '待确认场景' : SCENE_CONFIG[scene].label;
}

export function sceneInstruction(scene: Scene): string {
  return scene === 'unknown'
    ? '当前场景尚未确定。请先确认用户想规划校园路线、了解校园点位、安排校外旅行，还是需要使用帮助。'
    : SCENE_CONFIG[scene].instruction;
}

export function sceneTools(scene: Scene): SceneToolName[] {
  return scene === 'unknown' ? [] : [...SCENE_CONFIG[scene].tools];
}
