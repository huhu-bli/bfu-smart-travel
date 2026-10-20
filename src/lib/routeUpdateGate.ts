/** 跨异步阶段保持编辑锁；切换到新计划后，旧请求不能释放新计划的锁。 */
export function createRouteUpdateGate() {
  let revision = 0;
  let active: number | undefined;
  return {
    begin() {
      if (active !== undefined) return undefined;
      active = ++revision;
      return active;
    },
    invalidate() { revision += 1; active = undefined; },
    isCurrent(ticket: number) { return ticket === revision; },
    finish(ticket: number) {
      if (active !== ticket) return false;
      active = undefined;
      return true;
    },
  };
}
