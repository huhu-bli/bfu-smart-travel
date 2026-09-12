import { useState } from 'react';
import { TRIPS } from '../data/trips';

export default function Trips() {
  const [openId, setOpenId] = useState<string>(TRIPS[0]?.id ?? '');

  return (
    <section className="trips">
      <div className="gallery-head">
        <div>
          <h2>周边一日游</h2>
          <p>从北林出发不需要长途跋涉的六条线路，含时间轴、预算与出行提示。</p>
        </div>
      </div>

      <div className="trip-grid">
        {TRIPS.map((trip) => {
          const open = trip.id === openId;
          return (
            <article key={trip.id} className={open ? 'trip-card is-open' : 'trip-card'}>
              <button type="button" className="trip-head" onClick={() => setOpenId(open ? '' : trip.id)}>
                <span className="trip-emoji">{trip.emoji}</span>
                <span className="trip-title">
                  <strong>{trip.name}</strong>
                  <small>{trip.theme}</small>
                </span>
                <span className="trip-toggle">{open ? '−' : '+'}</span>
              </button>

              <div className="trip-meta">
                <span>⏱ {trip.duration}</span>
                <span>💰 {trip.budget}</span>
                <span>🍃 {trip.bestSeason}</span>
              </div>

              {open ? (
                <div className="trip-body">
                  <p className="trip-summary">{trip.summary}</p>
                  <p className="trip-transport">🚇 交通：{trip.transport}</p>
                  <ol className="timeline">
                    {trip.timeline.map((step) => (
                      <li key={step.time + step.title}>
                        <span className="timeline-time">{step.time}</span>
                        <span className="timeline-dot" />
                        <div className="timeline-main">
                          <strong>{step.title}</strong>
                          <p>{step.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="detail-block detail-block--tips">
                    <h4>出行提示</h4>
                    <ul className="bullet-list">
                      {trip.tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
