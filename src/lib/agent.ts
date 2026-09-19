/**
 * Agent 兼容入口。
 *
 * 真实实现已经拆到 src/agent/：
 * - config.ts：服务商和运行配置
 * - history.ts：上下文裁剪
 * - transports/：不同模型协议
 * - network.ts：网络请求和连接测试
 * - toolLoop.ts：工具调用循环
 * - runtime.ts：Agent 总调度
 *
 * 保留这个入口是为了让现有页面和旧代码不用一次性修改所有 import。
 */
export * from '../agent/types';
export * from '../agent/config';
export * from '../agent/errors';
export * from '../agent/history';
export * from '../agent/network';
export * from '../agent/runtime';
export * from '../agent/toolLoop';
export * from '../agent/transports/chat';
export * from '../agent/transports/responses';

export { TOOL_SCHEMAS } from './toolSchemas';
export { runTool } from './toolExecutor';
