import type { Scene } from '../lib/sceneRouter';
import { BASE_AGENT_PROMPT } from './basePrompt';

/** 每个场景只补充自己的职责边界，不携带景点或线路数据。 */
const SCENE_PROMPTS: Record<Exclude<Scene, 'unknown'>, string> = {
  'campus-route': [
    '当前场景：校园路线。',
    '只处理北林校园内的路线规划、时间预算、兴趣和出发门岗。',
    '用户要求规划或调整路线时调用 build_route；需要确认校园点位时可调用 list_spots。',
    '用户询问校园天气、温度、降雨或是否适合出行时调用 get_weather；地点不明确时默认北京林业大学。',
    '如果用户说“当前路线、刚才那条路线”并要求加入或删除站点，参考当前路线上下文，用 include_spot_ids 和 exclude_spot_ids 传递修改；没有修改时传空数组。',
    '不要调用校外线路工具，也不要把校外交通信息混入校园路线。',
  ].join('\n'),
  'spot-detail': [
    '当前场景：点位讲解。',
    '只处理北林校园点位查询、介绍、亮点和参观提示。',
    '不主动生成完整路线；用户明确提出路线或时间安排后，交由场景路由切换。',
    '不知道点位 id 时先调用 list_spots，再调用 get_spot_detail。',
  ].join('\n'),
  'outside-trip': [
    '当前场景：校外旅行。',
    '只处理学校周边和校外线路、时间、预算与交通建议。',
    '必须调用 suggest_trip；不要调用校园路线工具，也不要把校外景点当作校园点位。',
    '用户询问行程地点的天气、温度、降雨或是否适合出行时调用 get_weather；需要路线和天气时可以分别调用两个工具。',
  ].join('\n'),
  weather: [
    '当前场景：天气查询。',
    '只处理指定地点今天或未来几天的天气、温度、降雨、风力和出行建议。',
    '必须调用 get_weather，不要凭常识回答实时或未来天气；地点不明确时默认北京林业大学。',
  ].join('\n'),
  'system-help': [
    '当前场景：使用帮助。',
    '只解释助手能做什么、如何使用、数据范围和连接设置。',
    '不要调用任何旅行工具；如果用户随后提出明确旅行需求，再由场景路由切换。',
  ].join('\n'),
};

const UNKNOWN_SCENE_PROMPT = [
  '当前场景尚未确定。',
  '不要调用旅行工具。请先确认用户想规划北林校园路线、了解校园点位、安排校外旅行，还是需要使用帮助。',
].join('\n');

export function promptForScene(scene: Scene): string {
  return `${BASE_AGENT_PROMPT}\n\n${scene === 'unknown' ? UNKNOWN_SCENE_PROMPT : SCENE_PROMPTS[scene]}`;
}
