/** 对话场景。场景决定当前请求可以看到哪些提示词、工具和上下文。 */
export type Scene = 'campus-route' | 'spot-detail' | 'outside-trip' | 'system-help' | 'unknown';

export type SceneToolName = 'list_spots' | 'build_route' | 'get_spot_detail' | 'suggest_trip';

export interface SceneConfig {
  label: string;
  tools: SceneToolName[];
}

export const SCENE_CONFIG: Record<Exclude<Scene, 'unknown'>, SceneConfig> = {
  'campus-route': {
    label: '校园路线',
    tools: ['list_spots', 'build_route'],
  },
  'spot-detail': {
    label: '点位讲解',
    tools: ['list_spots', 'get_spot_detail'],
  },
  'outside-trip': {
    label: '校外旅行',
    tools: ['suggest_trip'],
  },
  'system-help': {
    label: '使用帮助',
    tools: [],
  },
};

const HELP = /(你好|您好|hi|hello|在吗|帮助|怎么用|如何使用|能做什么|你是谁|连接失败|api\s*key|密钥|设置)/i;
const OUTSIDE = /(校外|学校外|周边|出去玩|一日游|半天玩|半天游|周末去哪|去哪玩|公园|颐和园|圆明园|香山|奥森|奥林匹克|五道口|鹫峰|爬山|远一点|出学校|地铁|公交)/;
const EXPLICIT_OUTSIDE = /(校外|学校外|周边|出去玩|一日游|半天玩|半天游|周末去哪|去哪玩|出学校)/;
const CAMPUS_SCOPE = /(校园|校内|学校里|北林校园|东门|南门|北门|西门|小南门|东南门|西南门)/;
const ROUTE = /(路线|规划|怎么逛|游览|出发|经过|安排|分钟|小时|门岗|东门|南门|北门|西门|想看|兴趣)/;
const DETAIL = /(值得|怎么样|好不好|是什么|介绍|讲讲|说说|开放|几点|好玩|详情|详细|看看)/;
const FOLLOW_UP = /(换|改成|调整|再安排|继续|第二站|第一站|上一条|刚才|它|这个|该点)/;

/** 判断一句话属于哪个场景；无法确定时不强行猜测。 */
export function routeScene(text: string, currentScene: Scene = 'unknown'): Scene {
  const value = text.trim();
  if (!value) return 'unknown';
  if (HELP.test(value)) return 'system-help';
  // 「校园内的公园/绿地」属于校园场景；明确说周边、校外或出学校时才优先判为校外。
  if (EXPLICIT_OUTSIDE.test(value) || (OUTSIDE.test(value) && !CAMPUS_SCOPE.test(value))) {
    return 'outside-trip';
  }
  if (ROUTE.test(value)) return 'campus-route';
  if (DETAIL.test(value)) return 'spot-detail';
  if (currentScene !== 'unknown' && FOLLOW_UP.test(value)) return currentScene;
  return 'unknown';
}

export function sceneLabel(scene: Scene): string {
  return scene === 'unknown' ? '待确认场景' : SCENE_CONFIG[scene].label;
}

export function sceneTools(scene: Scene): SceneToolName[] {
  return scene === 'unknown' ? [] : [...SCENE_CONFIG[scene].tools];
}
