import { INTEREST_MAP } from '../data/interests';
import type { Spot } from '../types';
import SpotArt from './SpotArt';

interface Props {
  spot: Spot;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
  onUseAsStart?: (id: string) => void;
  canUseAsStart: boolean;
}

export default function SpotDetail({
  spot,
  isFavorite,
  onToggleFavorite,
  onClose,
  onUseAsStart,
  canUseAsStart,
}: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        <SpotArt spot={spot} size="lg" />
        <div className="modal-body">
          <div className="spot-card-top">
            <h2>{spot.name}</h2>
            {spot.mustSee ? <span className="badge">必看</span> : null}
          </div>
          <div className="tag-row">
            <span className="tag tag--kind">{spot.kind}</span>
            {spot.interests.map((id) => (
              <span key={id} className="tag">
                {INTEREST_MAP[id]?.emoji} {INTEREST_MAP[id]?.label}
              </span>
            ))}
          </div>
          <p className="modal-desc">{spot.description}</p>

          <dl className="detail-grid">
            <div>
              <dt>建议停留</dt>
              <dd>{spot.visit} 分钟</dd>
            </div>
            <div>
              <dt>最佳时段</dt>
              <dd>{spot.bestTime}</dd>
            </div>
          </dl>

          <div className="detail-block">
            <h4>亮点看点</h4>
            <ul className="bullet-list">
              {spot.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </div>

          {spot.tips ? (
            <div className="detail-block detail-block--tips">
              <h4>小贴士</h4>
              <p>{spot.tips}</p>
            </div>
          ) : null}

          <div className="modal-actions">
            <button type="button" className="primary-btn primary-btn--sm" onClick={() => onToggleFavorite(spot.id)}>
              {isFavorite ? '★ 已收藏' : '☆ 收藏这个点位'}
            </button>
            {canUseAsStart && onUseAsStart ? (
              <button type="button" className="ghost-btn" onClick={() => onUseAsStart(spot.id)}>
                从这里出发
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
