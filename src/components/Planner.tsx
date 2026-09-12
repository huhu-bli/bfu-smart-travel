import { DURATIONS, INTERESTS, PACES, gatesOf } from '../data/interests';
import { SPOTS } from '../data/spots';
import type { InterestId, PaceId } from '../types';

interface Props {
  interestIds: InterestId[];
  onToggleInterest: (id: InterestId) => void;
  durationId: string;
  onDuration: (id: string) => void;
  paceId: PaceId;
  onPace: (id: PaceId) => void;
  startId: string;
  onStart: (id: string) => void;
  onGenerate: () => void;
  dirty: boolean;
}

export default function Planner({
  interestIds,
  onToggleInterest,
  durationId,
  onDuration,
  paceId,
  onPace,
  startId,
  onStart,
  onGenerate,
  dirty,
}: Props) {
  const gates = gatesOf(SPOTS);

  return (
    <section className="planner-card">
      <div className="planner-head">
        <h2>告诉我你想怎么逛</h2>
        <p>选兴趣、给时长、定步速，下面会自动排出一条顺路的校园路线。</p>
      </div>

      <div className="field">
        <label className="field-label">1 · 你更想看什么</label>
        <div className="chip-grid">
          {INTERESTS.map((interest) => {
            const active = interestIds.includes(interest.id);
            return (
              <button
                key={interest.id}
                type="button"
                className={active ? 'chip is-active' : 'chip'}
                onClick={() => onToggleInterest(interest.id)}
                title={interest.desc}
              >
                <span className="chip-emoji">{interest.emoji}</span>
                <span className="chip-label">{interest.label}</span>
              </button>
            );
          })}
        </div>
        <p className="field-hint">
          {interestIds.length ? `已选 ${interestIds.length} 个兴趣方向` : '不选也可以，默认按园林植物 + 建筑人文 + 摄影推荐'}
        </p>
      </div>

      <div className="field">
        <label className="field-label">2 · 你有多少时间</label>
        <div className="seg-grid">
          {DURATIONS.map((duration) => (
            <button
              key={duration.id}
              type="button"
              className={duration.id === durationId ? 'segment is-active' : 'segment'}
              onClick={() => onDuration(duration.id)}
            >
              <strong>{duration.label}</strong>
              <small>{duration.desc}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">3 · 步速节奏</label>
        <div className="seg-grid seg-grid--three">
          {PACES.map((pace) => (
            <button
              key={pace.id}
              type="button"
              className={pace.id === paceId ? 'segment is-active' : 'segment'}
              onClick={() => onPace(pace.id)}
            >
              <strong>{pace.label}</strong>
              <small>{pace.desc}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="start-gate">
          4 · 从哪个门出发
        </label>
        <select id="start-gate" className="select" value={startId} onChange={(event) => onStart(event.target.value)}>
          {gates.map((gate) => (
            <option key={gate.id} value={gate.id}>
              {gate.name} · {gate.short}
            </option>
          ))}
        </select>
      </div>

      <button type="button" className={dirty ? 'primary-btn is-dirty' : 'primary-btn'} onClick={onGenerate}>
        {dirty ? '生成我的路线' : '重新生成路线'}
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10 2.5a7.5 7.5 0 1 0 7.07 5H15.4A6 6 0 1 1 10 4v2.2l3.6-2.35L10 2.5Z"
          />
        </svg>
      </button>
    </section>
  );
}
