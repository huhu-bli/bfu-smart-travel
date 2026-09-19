import { MAX_HISTORY_CHARS, MAX_HISTORY_GROUPS } from './config';
import type { AgentHistory } from './types';

function isUserItem(item: unknown): boolean {
  return Boolean(item) && (item as { role?: string }).role === 'user';
}

/** 找出每个用户提问的起始下标，避免裁剪掉工具调用和工具结果。 */
function groupStarts(history: AgentHistory): number[] {
  const starts: number[] = [];
  history.forEach((item, index) => {
    if (isUserItem(item)) starts.push(index);
  });
  return starts;
}

/** 只保留最近若干轮对话，并按体积限制继续裁剪。 */
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

