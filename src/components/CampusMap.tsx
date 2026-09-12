import type { RoutePlan, Spot } from '../types';

interface Props {
  spots: Spot[];
  plan?: RoutePlan | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}

const ROADS = [
  'M 500 30 L 500 250 L 470 590',
  'M 55 300 L 945 300',
  'M 560 120 L 560 300',
  'M 470 580 L 650 520',
  'M 620 300 L 800 455',
  'M 200 120 C 400 55, 700 75, 865 180 C 945 275, 905 490, 760 545 C 600 605, 370 595, 235 545 C 115 480, 85 300, 118 220 C 138 168, 158 140, 200 120',
];

const CANVAS = { width: 1000, height: 620 };

/** 紧凑模式只展示路线范围，自动放大，避免小尺寸下文字过小。 */
function routeViewBox(spots: Spot[]): string {
  if (!spots.length) return `0 0 ${CANVAS.width} ${CANVAS.height}`;

  const xs = spots.map((spot) => spot.x);
  const ys = spots.map((spot) => spot.y);
  let left = Math.min(...xs) - 120;
  let top = Math.min(...ys) - 110;
  const right = Math.max(...xs) + 120;
  const bottom = Math.max(...ys) + 110;

  if (right - left < 460) {
    const center = (left + right) / 2;
    left = Math.max(0, Math.min(center - 230, CANVAS.width - 460));
  }
  if (bottom - top < 340) {
    const center = (top + bottom) / 2;
    top = Math.max(0, Math.min(center - 170, CANVAS.height - 340));
  }

  const width = Math.min(Math.max(right - left, 460), CANVAS.width - left);
  const height = Math.min(Math.max(bottom - top, 340), CANVAS.height - top);

  return `${Math.round(left)} ${Math.round(top)} ${Math.round(width)} ${Math.round(height)}`;
}

export default function CampusMap({ spots, plan, activeId, onSelect, compact = false }: Props) {
  const routeSpots: Spot[] = plan ? [plan.origin, ...plan.stops.map((stop) => stop.spot)] : [];
  const routeIds = new Set(routeSpots.map((spot) => spot.id));
  const routePoints = routeSpots.map((spot) => `${spot.x},${spot.y}`).join(' ');
  const visited = new Set(plan ? plan.stops.map((stop) => stop.spot.id) : []);

  const visible = compact && plan ? spots.filter((spot) => routeIds.has(spot.id)) : spots;
  const routeKey = routeSpots.map((spot) => spot.id).join('-');
  const viewBox = compact ? routeViewBox(routeSpots) : `0 0 ${CANVAS.width} ${CANVAS.height}`;

  return (
    <div className={compact ? 'map-shell map-shell--compact' : 'map-shell'}>
      <svg viewBox={viewBox} role="img" aria-label="北京林业大学校园示意图">
        <defs>
          <linearGradient id="map-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#eef6ee" />
            <stop offset="1" stopColor="#e3efe4" />
          </linearGradient>
          <pattern id="map-dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.1" fill="#cfe2d2" />
          </pattern>
        </defs>

        <rect x="0" y="0" width={CANVAS.width} height={CANVAS.height} fill="url(#map-bg)" />
        <rect x="0" y="0" width={CANVAS.width} height={CANVAS.height} fill="url(#map-dots)" opacity="0.7" />
        <rect
          x="38"
          y="18"
          width="924"
          height="584"
          rx="52"
          fill="#ffffff"
          fillOpacity="0.55"
          stroke="#bcd6c1"
          strokeWidth="3"
          strokeDasharray="10 8"
        />

        {ROADS.map((road) => (
          <path key={`o-${road}`} d={road} fill="none" stroke="#cfe0d2" strokeWidth="20" strokeLinecap="round" />
        ))}
        {ROADS.map((road) => (
          <path key={`i-${road}`} d={road} fill="none" stroke="#ffffff" strokeWidth="13" strokeLinecap="round" />
        ))}

        <ellipse cx="545" cy="212" rx="105" ry="66" fill="#cfe9cd" opacity="0.85" />
        <ellipse cx="215" cy="462" rx="62" ry="44" fill="#dcefcf" opacity="0.9" />
        <ellipse cx="120" cy="545" rx="58" ry="40" fill="#e6f2d5" opacity="0.9" />
        <path d="M 60 560 C 200 470, 340 520, 470 460" fill="none" stroke="#bfe0f0" strokeWidth="14" strokeLinecap="round" opacity="0.75" />

        <text x="52" y="52" className="map-region">教学 · 科研区</text>
        <text x="905" y="600" textAnchor="end" className="map-region">生活 · 运动区</text>
        <text x="948" y="292" textAnchor="end" className="map-region">清华东路方向</text>

        {plan ? (
          <polyline
            key={routeKey}
            className="route-path"
            points={routePoints}
            fill="none"
            stroke="#e0a92b"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {visible.map((spot) => {
          const isActive = spot.id === activeId;
          const order = routeSpots.findIndex((item) => item.id === spot.id);
          const isRoute = order >= 0;
          const isOrigin = plan ? spot.id === plan.origin.id : false;
          const dim = Boolean(plan) && !compact && !isRoute;

          return (
            <g
              key={spot.id}
              className={[
                'map-spot',
                isActive ? 'is-active' : '',
                isRoute ? 'is-route' : '',
                dim ? 'is-dim' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(spot.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(spot.id);
              }}
            >
              <circle cx={spot.x} cy={spot.y} r="27" className="map-hit" />
              <circle cx={spot.x} cy={spot.y} r="15" className="map-dot" />
              <text x={spot.x} y={spot.y + 5} textAnchor="middle" className="map-emoji">
                {spot.emoji}
              </text>
              {isRoute && !isOrigin ? (
                <g className="map-badge">
                  <circle cx={spot.x + 17} cy={spot.y - 17} r="11" />
                  <text x={spot.x + 17} y={spot.y - 13} textAnchor="middle">
                    {order}
                  </text>
                </g>
              ) : null}
              {isOrigin ? (
                <g className="map-badge map-badge--origin">
                  <circle cx={spot.x + 17} cy={spot.y - 17} r="11" />
                  <text x={spot.x + 17} y={spot.y - 13} textAnchor="middle">
                    起
                  </text>
                </g>
              ) : null}
              <text x={spot.x} y={spot.y + 36} textAnchor="middle" className="map-label">
                {spot.name}
              </text>
            </g>
          );
        })}
      </svg>

      {!compact ? (
        <div className="map-legend">
          <span>
            <i className="legend-dot legend-dot--route" />
            推荐路线
          </span>
          <span>
            <i className="legend-dot" />
            可游览点位
          </span>
          <span>
            <i className="legend-dot legend-dot--fav" />
            已收藏
          </span>
          <span className="map-legend-note">点击任意点位查看讲解</span>
        </div>
      ) : null}

      {visited.size === 0 && compact ? (
        <p className="map-empty">调整左侧条件后，路线会自动更新。</p>
      ) : null}
    </div>
  );
}
