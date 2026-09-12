import { useEffect, useRef, useState } from 'react';
import { SPOT_MAP } from '../data/spots';
import { TRIPS } from '../data/trips';
import { answerLocally } from '../lib/localAgent';
import {
  DEFAULT_AGENT_SETTINGS,
  PROVIDERS,
  describePlanOption,
  formatPlanSummary,
  probeConnection,
  providerOf,
  runAgentTurn,
  type AgentHistory,
  type AgentProviderId,
  type AgentSettings,
  type ProbeResult,
} from '../lib/agent';
import { useLocalStorage } from '../lib/storage';
import type { PlanOptions, RoutePlan } from '../types';

interface Props {
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

const QUICK_PROMPTS = [
  '我只有 1 小时，从东门进，怎么逛最值？',
  '银杏大道现在值得专门去一趟吗？',
  '周末想在校外玩半天，别太贵，有什么推荐？',
];

let turnSeed = 0;
const nextId = () => {
  turnSeed += 1;
  return `turn-${turnSeed}`;
};

export default function AgentPanel({ onSelectSpot, onApplyPlan, onOpenMap, onOpenTrips }: Props) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useLocalStorage<AgentSettings>('agent', DEFAULT_AGENT_SETTINGS);
  const configured =
    settings.mode === 'direct' ? settings.apiKey.trim().length > 0 : settings.proxyUrl.trim().length > 0;
  // 没配置过就直接展开设置，省得用户找不到入口。
  const [settingsOpen, setSettingsOpen] = useState(!configured);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const historyRef = useRef<AgentHistory>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const migrated = useRef(false);

  // 兼容早期版本保存的设置：缺 provider/protocol 时补齐。
  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;
    if (settings.provider && settings.protocol) return;
    setSettings((prev) => {
      // 早期版本没有服务商概念：地址指向 OpenAI 就沿用，否则迁移到默认的 DeepSeek。
      const looksLikeOpenAi = /openai\.com/i.test(prev.baseUrl ?? '');
      const preset = providerOf(looksLikeOpenAi ? 'openai' : 'deepseek');
      return {
        ...DEFAULT_AGENT_SETTINGS,
        ...prev,
        provider: preset.id,
        protocol: preset.protocol,
        baseUrl: prev.baseUrl || preset.baseUrl,
        model: looksLikeOpenAi ? prev.model || preset.model : preset.model,
        // 换了服务商，旧密钥不再适用，清掉避免误用。
        apiKey: looksLikeOpenAi ? prev.apiKey : '',
      };
    });
  }, [settings, setSettings]);

  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, turns, busy]);

  useEffect(() => {
    if (!configured) setSettingsOpen(true);
  }, [configured]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    setTurns((prev) => [...prev, { id: nextId(), role: 'user', text: question }]);
    setBusy(true);

    // 没配置密钥时用内置助手作答，保证任何访客都能直接用。
    if (!configured) {
      try {
        const local = answerLocally(question);
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
            trace: local.trace,
            offline: true,
          },
        ]);
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const result = await runAgentTurn({
        history: historyRef.current,
        userText: question,
        settings,
      });
      historyRef.current = result.history;
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
          trace: result.trace,
        },
      ]);
    } catch (error) {
      setTurns((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: error instanceof Error ? error.message : '请求失败，请稍后重试。',
          isError: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    historyRef.current = [];
    setTurns([]);
  };

  /** 切换服务商：地址、模型、协议一起换，并重置上下文（两套协议的历史不通用）。 */
  const switchProvider = (id: AgentProviderId) => {
    if (id === settings.provider) return;
    const preset = providerOf(id);
    const hadKey = settings.apiKey.trim().length > 0;
    setSettings((prev) => ({
      ...prev,
      provider: id,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      model: preset.model || prev.model,
      // 各家密钥不通用，切换时清掉，避免把 A 家的密钥发给 B 家。
      apiKey: '',
    }));
    setProbe(null);
    if (turns.length || historyRef.current.length) {
      historyRef.current = [];
      setTurns((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: `已切换到 ${preset.label}，对话上下文已重置。${hadKey ? '原来的密钥不属于这家服务商，已清空，请重新填写。' : ''}`,
        },
      ]);
    } else if (hadKey) {
      historyRef.current = [];
    }
  };

  const runProbe = async () => {
    setProbing(true);
    setProbe(null);
    try {
      setProbe(await probeConnection(settings));
    } catch (error) {
      setProbe({
        ok: false,
        latencyMs: 0,
        message: error instanceof Error ? error.message : '测试失败。',
      });
    } finally {
      setProbing(false);
    }
  };

  /** 一键回到初始配置：换服务商、密钥填错、想把上下文清干净时用。 */
  const resetSettings = () => {
    setSettings(DEFAULT_AGENT_SETTINGS);
    historyRef.current = [];
    setTurns([]);
    setProbe(null);
    setSettingsOpen(true);
  };

  return (
    <>
      {open ? null : (
        <button type="button" className="agent-fab" onClick={() => setOpen(true)}>
          <span className="agent-fab-icon">🤖</span>
          <span className="agent-fab-text">AI 行程助手</span>
        </button>
      )}

      {open ? (
        <section className="agent-panel" aria-label="AI 行程助手">
          <header className="agent-head">
            <div className="agent-title">
              <strong>AI 行程助手</strong>
              <small>
                {providerOf(settings.provider).label} · {settings.mode === 'direct' ? '直连' : '代理'} ·{' '}
                {settings.model}
              </small>
            </div>
            <div className="agent-head-actions">
              <button type="button" className="icon-btn" onClick={() => setSettingsOpen((prev) => !prev)} title="设置">
                ⚙
              </button>
              <button type="button" className="icon-btn" onClick={reset} title="清空对话">
                ⟲
              </button>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} title="收起">
                ✕
              </button>
            </div>
          </header>

          {settingsOpen ? (
            <div className="agent-settings">
              <div className="agent-field">
                <span>服务商</span>
                <div className="provider-row">
                  {PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      className={settings.provider === provider.id ? 'mode-btn is-active' : 'mode-btn'}
                      onClick={() => switchProvider(provider.id)}
                    >
                      {provider.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="agent-mode">
                <button
                  type="button"
                  className={settings.mode === 'direct' ? 'mode-btn is-active' : 'mode-btn'}
                  onClick={() => setSettings((prev) => ({ ...prev, mode: 'direct' }))}
                >
                  直连（自用）
                </button>
                <button
                  type="button"
                  className={settings.mode === 'proxy' ? 'mode-btn is-active' : 'mode-btn'}
                  onClick={() => setSettings((prev) => ({ ...prev, mode: 'proxy' }))}
                >
                  代理（可公开）
                </button>
              </div>

              {settings.mode === 'direct' ? (
                <>
                  <label className="agent-field">
                    <span>{providerOf(settings.provider).label} API Key</span>
                    <input
                      type="password"
                      value={settings.apiKey}
                      placeholder={providerOf(settings.provider).keyHint}
                      autoComplete="off"
                      onChange={(event) => setSettings((prev) => ({ ...prev, apiKey: event.target.value }))}
                    />
                  </label>
                  <label className="agent-field">
                    <span>API 地址（切换服务商时自动填好，可手改）</span>
                    <input
                      type="url"
                      value={settings.baseUrl}
                      placeholder={providerOf(settings.provider).baseUrl || 'https://your-endpoint/v1'}
                      autoComplete="off"
                      onChange={(event) => setSettings((prev) => ({ ...prev, baseUrl: event.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="agent-field">
                    <span>代理地址</span>
                    <input
                      type="url"
                      value={settings.proxyUrl}
                      placeholder="https://your-worker.workers.dev/"
                      autoComplete="off"
                      onChange={(event) => setSettings((prev) => ({ ...prev, proxyUrl: event.target.value }))}
                    />
                  </label>
                  <label className="agent-field">
                    <span>访问口令（Worker 的 APP_TOKEN，可留空）</span>
                    <input
                      type="password"
                      value={settings.proxyToken}
                      placeholder="可选"
                      autoComplete="off"
                      onChange={(event) => setSettings((prev) => ({ ...prev, proxyToken: event.target.value }))}
                    />
                  </label>
                </>
              )}

              <label className="agent-field">
                <span>模型</span>
                <input
                  type="text"
                  value={settings.model}
                  list="agent-model-hints"
                  onChange={(event) => setSettings((prev) => ({ ...prev, model: event.target.value }))}
                />
                <datalist id="agent-model-hints">
                  {providerOf(settings.provider).models.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>

              <p className="agent-note">{providerOf(settings.provider).note}</p>

              <p className="agent-note">
                {settings.mode === 'direct'
                  ? '密钥只保存在这台设备的浏览器里，不会上传到本项目的服务器（本项目也没有服务器）。但浏览器直连会暴露给使用者，公开分享请改用代理模式。'
                  : '代理模式下密钥保存在你的 Serverless 环境变量里，浏览器只请求代理地址。部署方法见仓库 README 的「AI 行程助手」章节。'}
              </p>

              <div className="agent-probe">
                <button type="button" className="ghost-btn" onClick={() => void runProbe()} disabled={probing}>
                  {probing ? '测试中…' : '测试连接'}
                </button>
                <button type="button" className="ghost-btn" onClick={resetSettings}>
                  清空配置
                </button>
                {probe ? (
                  <span className={probe.ok ? 'probe-result is-ok' : 'probe-result is-bad'}>
                    {probe.ok ? '✅ ' : '❌ '}
                    {probe.message}
                  </span>
                ) : null}
              </div>
              {probe?.detail ? <p className="agent-note">技术细节：{probe.detail}</p> : null}
            </div>
          ) : null}

          <div className="agent-body" ref={scrollRef}>
            {turns.length === 0 ? (
              <div className="agent-welcome">
                <p>
                  我是北林行程助手，可以帮你排校园路线、讲点位、推校外一日游。
                  {configured ? '' : ' 当前用内置助手作答，不需要密钥。'}
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
                    <div className="agent-card-actions">
                      <button type="button" className="ghost-btn" onClick={() => onApplyPlan(turn.plan!, turn.planOptions!)}>
                        载入规划器
                      </button>
                      <button type="button" className="ghost-btn" onClick={onOpenMap}>
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
              placeholder={configured ? '说说你想怎么逛…（Enter 发送，Shift+Enter 换行）' : '直接问就行，未配置密钥时由内置助手作答'}
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
        </section>
      ) : null}
    </>
  );
}
