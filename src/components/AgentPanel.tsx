import { useEffect, useRef, useState } from 'react';
import { SPOT_MAP } from '../data/spots';
import { TRIPS } from '../data/trips';
import { answerLocally, type LocalMemory } from '../lib/localAgent';
import {
  DEFAULT_AGENT_SETTINGS,
  describePlanOption,
  formatPlanSummary,
  runAgentTurn,
  type AgentHistory,
} from '../lib/agent';
import { routeScene, sceneLabel, type Scene } from '../lib/sceneRouter';
import type { PlanOptions, RoutePlan } from '../types';

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  currentPlan: RoutePlan | null;
  currentPlanOptions: PlanOptions | null;
  onSelectSpot: (id: string) => void;
  onApplyPlan: (plan: RoutePlan, options: PlanOptions) => void;
  onOpenMap: () => void;
  onOpenTrips: () => void;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  plan?: RoutePlan | null;
  planOptions?: PlanOptions | null;
  spotIds?: string[];
  tripIds?: string[];
  trace?: string[];
  isError?: boolean;
  /** 内置助手（未配置密钥）作答 */
  offline?: boolean;
}

interface PanelSize {
  width: number;
  height: number | null;
}

const QUICK_PROMPTS = [
  '我只有 1 小时，从东门进，怎么逛最值？',
  '银杏大道现在值得专门去一趟吗？',
  '周末想在校外玩半天，别太贵，有什么推荐？',
];

/** 聊天记录存在本地，刷新页面还能接着聊；只保留最近 30 条显示消息。 */
const CHAT_STORAGE_KEY = 'bfu-smart-travel:chat';
const KEEP_TURNS = 30;
const DEFAULT_PANEL_SIZE: PanelSize = { width: 396, height: null };
const PANEL_SIZE_STORAGE_KEY = 'bfu-smart-travel:agent-panel-size';
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;
const MIN_PANEL_HEIGHT = 420;
const MAX_PANEL_HEIGHT = 760;

let turnSeed = 0;
const nextId = () => {
  turnSeed += 1;
  return `turn-${turnSeed}`;
};

function clampPanelSize(width: number, height: number): PanelSize {
  const viewportWidth = Math.max(window.innerWidth, 280);
  const viewportHeight = Math.max(window.innerHeight, 280);
  const minWidth = Math.min(MIN_PANEL_WIDTH, viewportWidth - 20);
  const maxWidth = Math.max(minWidth, Math.min(MAX_PANEL_WIDTH, viewportWidth - 20));
  const minHeight = Math.min(MIN_PANEL_HEIGHT, viewportHeight - 20);
  const maxHeight = Math.max(minHeight, Math.min(MAX_PANEL_HEIGHT, viewportHeight - 20));

  return {
    width: Math.round(Math.min(maxWidth, Math.max(minWidth, width))),
    height: Math.round(Math.min(maxHeight, Math.max(minHeight, height))),
  };
}

function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('浏览器无法连接 Worker') ||
      error.message.includes('网络请求失败') ||
      error.name === 'AbortError')
  );
}

function readPanelSize(): PanelSize {
  if (typeof window === 'undefined') return DEFAULT_PANEL_SIZE;
  try {
    const saved = JSON.parse(window.localStorage.getItem(PANEL_SIZE_STORAGE_KEY) ?? 'null') as Partial<PanelSize> | null;
    if (typeof saved?.width !== 'number') return DEFAULT_PANEL_SIZE;
    if (saved.height !== null && saved.height !== undefined && typeof saved.height !== 'number') {
      return DEFAULT_PANEL_SIZE;
    }
    return { width: saved.width, height: saved.height ?? null };
  } catch {
    return DEFAULT_PANEL_SIZE;
  }
}

export default function AgentPanel({
  open,
  onOpen,
  onClose,
  currentPlan,
  currentPlanOptions,
  onSelectSpot,
  onApplyPlan,
  onOpenMap,
  onOpenTrips,
}: Props) {
  const configured = Boolean(DEFAULT_AGENT_SETTINGS.proxyUrl);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<AgentHistory>([]);
  const historiesRef = useRef<Partial<Record<Scene, AgentHistory>>>({});
  const activeSceneRef = useRef<Scene>('unknown');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const localMemoryBySceneRef = useRef<Partial<Record<Scene, LocalMemory>>>({});
  const chatRestored = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>(readPanelSize);
  const [isResizing, setIsResizing] = useState(false);

  // 记住用户调整后的尺寸；拖拽过程中延迟写入，避免每个指针事件都访问 localStorage。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify(panelSize));
      } catch {
        // 忽略隐私模式或禁用存储时的写入失败
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [panelSize]);

  // 对话框打开时锁住页面滚动，避免手机上滚动聊天内容把底层页面一起带动。
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const previousOverscroll = document.documentElement.style.overscrollBehavior;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.documentElement.style.overscrollBehavior = previousOverscroll;
    };
  }, [open]);

  // 调整尺寸时监听窗口级指针事件，鼠标或手指移出手柄后仍能顺利完成拖拽。
  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (event: PointerEvent) => {
      const start = resizeRef.current;
      if (!start) return;
      setPanelSize(
        clampPanelSize(start.startWidth - (event.clientX - start.startX), start.startHeight - (event.clientY - start.startY)),
      );
    };
    const handleEnd = () => {
      resizeRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [isResizing]);

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    setIsResizing(true);
  };

  const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 48 : 16;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelSize(
      clampPanelSize(
        rect.width + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
        rect.height + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
      ),
    );
  };

  // 清理旧版本保存的接口配置，避免浏览器继续保留已经废弃的密钥或地址。
  useEffect(() => {
    try {
      window.localStorage.removeItem('agent');
    } catch {
      // 忽略隐私模式或禁用存储时的读取失败
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, turns, busy]);

  // 恢复上次的对话（协议一致才恢复，切换服务商后历史格式不通用）
  useEffect(() => {
    if (chatRestored.current) return;
    chatRestored.current = true;
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        protocol?: string;
        history?: AgentHistory;
        histories?: Partial<Record<Scene, AgentHistory>>;
        activeScene?: Scene;
        turns?: ChatTurn[];
      };
      if (!saved || saved.protocol !== DEFAULT_AGENT_SETTINGS.protocol) return;
      if (Array.isArray(saved.turns) && saved.turns.length) {
        historiesRef.current = saved.histories ?? {};
        activeSceneRef.current = saved.activeScene ?? 'unknown';
        historyRef.current = historiesRef.current[activeSceneRef.current] ?? saved.history ?? [];
        setTurns(saved.turns);
      }
    } catch {
      // 解析失败就当没有历史
    }
  }, [DEFAULT_AGENT_SETTINGS.protocol]);

  // 保存对话
  useEffect(() => {
    if (!chatRestored.current) return;
    try {
      if (!turns.length) {
        window.localStorage.removeItem(CHAT_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({
          protocol: DEFAULT_AGENT_SETTINGS.protocol,
          history: historyRef.current,
          histories: historiesRef.current,
          activeScene: activeSceneRef.current,
          turns: turns.slice(-KEEP_TURNS),
        }),
      );
    } catch {
      // 超出配额就放弃保存，不影响使用
    }
  }, [turns, DEFAULT_AGENT_SETTINGS.protocol]);

  const runWithFallback = async (question: string) =>
    runAgentTurn({
      history: historyRef.current,
      userText: question,
      settings: DEFAULT_AGENT_SETTINGS,
      scene: activeSceneRef.current,
      currentPlan,
      currentPlanOptions,
    });

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    setTurns((prev) => [...prev, { id: nextId(), role: 'user', text: question }]);
    setBusy(true);
    const scene = routeScene(question, activeSceneRef.current);
    activeSceneRef.current = scene;
    historyRef.current = historiesRef.current[scene] ?? [];

    // 没配置密钥时用内置助手作答，保证任何访客都能直接用。
    if (!configured) {
      try {
        const local = answerLocally(question, localMemoryBySceneRef.current[scene] ?? null);
        localMemoryBySceneRef.current[local.memory.scene] = local.memory;
        setTurns((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            text: local.text,
            plan: local.plan,
            planOptions: local.planOptions,
            spotIds: local.spotIds,
            tripIds: local.tripIds,
            trace: [`场景：${sceneLabel(local.memory.scene)}`, ...local.trace],
            offline: true,
          },
        ]);
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const result = await runWithFallback(question);
      historyRef.current = result.history;
      historiesRef.current[result.scene] = result.history;
      setTurns((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: result.text,
          plan: result.plan,
          planOptions: result.planOptions,
          spotIds: result.spotIds,
          tripIds: result.tripIds,
          trace: [
            `场景：${sceneLabel(result.scene)}`,
            ...(result.trimmed ? ['已省略较早的对话（保持请求体积可控）'] : []),
            ...result.trace,
          ],
        },
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '请求失败';
      if (isNetworkFailure(error)) {
        // 只有 Worker 网络不可达时才使用本地助手；认证、权限和额度错误必须明确展示。
        const fallback = answerLocally(question, localMemoryBySceneRef.current[scene] ?? null);
        localMemoryBySceneRef.current[fallback.memory.scene] = fallback.memory;
        setTurns((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            text: fallback.text,
            plan: fallback.plan,
            planOptions: fallback.planOptions,
            spotIds: fallback.spotIds,
            tripIds: fallback.tripIds,
            trace: [
              `场景：${sceneLabel(fallback.memory.scene)}`,
              `千问 Agent 网络暂时不可用（${reason}），已用内置助手作答`,
              ...fallback.trace,
            ],
            offline: true,
          },
        ]);
      } else {
        setTurns((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            text: `千问 Agent 暂时不可用：${reason}\n\n请检查 Worker 的 QWEN_API_KEY 后重试。此次没有切换到内置助手。`,
            trace: [
              `场景：${sceneLabel(scene)}`,
              '千问 Agent 请求失败，未切换到内置助手',
            ],
            isError: true,
          },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    historyRef.current = [];
    historiesRef.current = {};
    localMemoryBySceneRef.current = {};
    activeSceneRef.current = 'unknown';
    setTurns([]);
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // 忽略
    }
  };

  return (
    <>
      {open ? null : (
        <button type="button" className="agent-fab" onClick={onOpen}>
          <span className="agent-fab-icon">🤖</span>
          <span className="agent-fab-text">AI 行程助手</span>
        </button>
      )}

      {open ? (
        <>
          <button
            type="button"
            className="agent-backdrop"
            aria-label="关闭 AI 行程助手"
            onClick={onClose}
            onWheel={(event) => event.preventDefault()}
            onTouchMove={(event) => event.preventDefault()}
          />
          <section
            ref={panelRef}
            className={isResizing ? 'agent-panel is-resizing' : 'agent-panel'}
            style={{ width: panelSize.width, ...(panelSize.height ? { height: panelSize.height } : {}) }}
            role="dialog"
            aria-modal="true"
            aria-label="AI 行程助手"
          >
          <header className="agent-head">
            <div className="agent-title">
              <strong>AI 行程助手</strong>
              <small>通义千问 · Cloudflare Worker · qwen3.8-flash</small>
            </div>
            <div className="agent-head-actions">
              <button type="button" className="icon-btn" onClick={reset} title="清空对话">
                ⟲
              </button>
              <button type="button" className="icon-btn" onClick={onClose} title="收起">
                ✕
              </button>
            </div>
          </header>

          <div className="agent-body" ref={scrollRef}>
            {turns.length === 0 ? (
              <div className="agent-welcome">
                <p>
                  我是北林行程助手，可以帮你排校园路线、讲点位、推校外一日游。
                  {configured
                    ? ' 通过千问 Agent 规划路线，追问「改成 2 小时」也能接着调整。'
                    : ' 当前使用内置助手；排完路线后接着说「改成 2 小时」「换成南门」也能继续调整。'}
                </p>
                <div className="agent-quick">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => send(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {turns.map((turn) => (
              <article key={turn.id} className={`agent-turn agent-turn--${turn.role}`}>
                <div className={turn.isError ? 'agent-bubble is-error' : 'agent-bubble'}>{turn.text}</div>

                {turn.plan && turn.planOptions ? (
                  <div className="agent-card">
                    <div className="agent-card-head">
                      <strong>{formatPlanSummary(turn.plan)}</strong>
                      <span>{describePlanOption(turn.planOptions)}</span>
                    </div>
                    <ol className="agent-card-stops">
                      {turn.plan.stops.map((stop, index) => (
                        <li key={stop.spot.id}>
                          <b>{index + 1}</b>
                          <button type="button" onClick={() => onSelectSpot(stop.spot.id)}>
                            {stop.spot.name}
                          </button>
                          <span>
                            {Math.round(stop.leave - stop.arrive)} 分钟 · 步行 {stop.walkMeters} 米
                          </span>
                        </li>
                      ))}
                    </ol>
                    {(turn.plan.optionalStops?.length ?? 0) > 0 ? (
                      <div className="agent-card-subsection">
                        <strong>可选站点</strong>
                        <span>{(turn.plan.optionalStops ?? []).map((stop) => `${stop.spot.name}（${Math.round(stop.leave - stop.arrive)} 分钟）`).join('、')}</span>
                      </div>
                    ) : null}
                    <div className="agent-card-subsection agent-card-subsection--advice">
                      <strong>剩余时间建议 · 约 {turn.plan.remainingMinutes ?? 0} 分钟</strong>
                      <span>{turn.plan.remainingAdvice ?? '可根据体力安排拍照、休息或延伸点位。'}</span>
                    </div>
                    <div className="agent-card-actions">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          onApplyPlan(turn.plan!, turn.planOptions!);
                          onClose();
                        }}
                      >
                        载入规划器
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          onOpenMap();
                          onClose();
                        }}
                      >
                        在地图中查看
                      </button>
                    </div>
                  </div>
                ) : null}

                {turn.spotIds && turn.spotIds.length ? (
                  <div className="agent-chips">
                    {turn.spotIds.map((id) => (
                      <button key={id} type="button" className="agent-chip" onClick={() => onSelectSpot(id)}>
                        {SPOT_MAP[id]?.emoji} {SPOT_MAP[id]?.name ?? id}
                      </button>
                    ))}
                  </div>
                ) : null}

                {turn.tripIds && turn.tripIds.length ? (
                  <div className="agent-chips">
                    {turn.tripIds.map((id) => {
                      const trip = TRIPS.find((item) => item.id === id);
                      return (
                        <button key={id} type="button" className="agent-chip" onClick={onOpenTrips}>
                          {trip?.emoji} {trip?.name ?? id}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {turn.trace && turn.trace.length ? (
                  <p className="agent-trace">
                    {turn.offline ? '内置助手作答 · 不消耗额度 · ' : ''}
                    调用：{turn.trace.join('、')}
                  </p>
                ) : null}
                {turn.offline && (!turn.trace || !turn.trace.length) ? (
                  <p className="agent-trace">内置助手作答 · 不消耗额度</p>
                ) : null}
              </article>
            ))}

            {busy ? (
              <div className="agent-turn agent-turn--assistant">
                <div className="agent-bubble agent-bubble--typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : null}
          </div>

          <form
            className="agent-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <textarea
              value={input}
              rows={2}
              placeholder="说说你想怎么逛…（Enter 发送，Shift+Enter 换行）"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
            />
            <button type="submit" className="agent-send" disabled={busy || !input.trim()}>
              {busy ? '…' : '发送'}
            </button>
          </form>
            <button
              type="button"
              className="agent-resize-handle"
              aria-label="调整 AI 对话框大小"
              title="拖动调整对话框大小；方向键也可以调整"
              onPointerDown={startResize}
              onKeyDown={resizeWithKeyboard}
            />
          </section>
        </>
      ) : null}
    </>
  );
}
