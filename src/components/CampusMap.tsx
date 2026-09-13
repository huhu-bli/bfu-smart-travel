import {
  CAMPUS_ATTRIBUTION,
  CAMPUS_BOUNDARY,
  CAMPUS_BUILDINGS,
  CAMPUS_GREENS,
  CAMPUS_ROADS,
  CAMPUS_VIEWBOX,
} from '../data/campusGeometry';
import type { RoutePlan, Spot } from '../types';

interface Props {
  spots: Spot[];
  plan?: RoutePlan | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}

/** "x,y x,y ..." → SVG path */
function toPath(points: string, close = true): string {
  const pairs = points.split(' ').filter(Boolean);
  if (!pairs.length) return '';
  const [first, ...rest] = pairs;
  const head = `M ${first.replace(',', ' ')}`;
  const body = rest.map((pair) => ` L ${pair.replace(',', ' ')}`).join('');
  return close ? `${head}${body} Z` : `${head}${body}`;
}

const GREENS = CAMPUS_GREENS.map((green) => toPath(green.points));
const BUILDINGS = CAMPUS_BUILDINGS.map((building) => toPath(building.points));
const ROADS = CAMPUS_ROADS.map((road) => {
  const path = toPath(road.points, false);
  const wide = road.kind === 'secondary' || road.kind === 'tertiary' || road.kind === 'residential';
  return { path, wide };
});

/** 紧凑地图只显示路线范围，自动放大，避免小尺寸下文字过小。 */
function routeViewBox(spots: Spot[]): string {
  const size = CAMPUS_VIEWBOX;
  if (!spots.length) return `0 0 ${size} ${size}`;
  const xs = spots.map((spot) => spot.x);
  const ys = spots.map((spot) => spot.y);
  const minWidth = 360;
  const minHeight = 360;
  const pad = 90;
  let left = Math.min(...xs) - pad;
  let top = Math.min(...ys) - pad;
  const right = Math.max(...xs) + pad;
  const bottom = Math.max(...ys) + pad;

  if (right - left < minWidth) {
    const center = (left + right) / 2;
    left = Math.max(0, Math.min(center - minWidth / 2, size - minWidth));
  }
  if (bottom - top < minHeight) {
    const center = (top + bottom) / 2;
    top = Math.max(0, Math.min(center - minHeight / 2, size - minHeight));
  }

  const width = Math.min(Math.max(right - left, minWidth), size - left);
  const height = Math.min(Math.max(bottom - top, minHeight), size - top);
  return `${Math.round(left)} ${Math.round(top)} ${Math.round(width)} ${Math.round(height)}`;
}

export default function CampusMap({ spots, plan, activeId, onSelect, compact = false }: Props) {
  const routeSpots: Spot[] = plan ? [plan.origin, ...plan.stops.map((stop) => stop.spot)] : [];
  const routeIds = new Set(routeSpots.map((spot) => spot.id));
  const routePoints = routeSpots.map((spot) => `${spot.x},${spot.y}`).join(' ');
  const visited = new Set(plan ? plan.stops.map((stop) => stop.spot.id) : []);

  const visible = compact && plan ? spots.filter((spot) => routeIds.has(spot.id)) : spots;
  const routeKey = routeSpots.map((spot) => spot.id).join('-');
  const viewBox = compact
    ? routeViewBox(routeSpots)
    : `0 0 ${CAMPUS_VIEWBOX} ${CAMPUS_VIEWBOX}`;

  return (
    <div className={compact ? 'map-shell map-shell--compact' : 'map-shell'}>
      <svg
        viewBox={viewBox}
        role="img"
        aria-label="北京林业大学校园地图（数据来自 OpenStreetMap）"
      >
        <defs>
          <linearGradient id="map-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3f8f2" />
            <stop offset="1" stopColor="#e9f2e8" />
          </linearGradient>
        </defs>

        <rect x="-200" y="-200" width={CAMPUS_VIEWBOX + 400} height={CAMPUS_VIEWBOX + 400} fill="url(#map-bg)" />

        {/* 绿地 */}
        {GREENS.map((path, index) => (
          <path key={`g-${index}`} d={path} fill="#d8ead3" stroke="#c7dfc2" strokeWidth="0.8" />
        ))}

        {/* 校园边界 */}
        <path d={toPath(CAMPUS_BOUNDARY)} fill="#ffffff" fillOpacity="0.5" stroke="#8fb69a" strokeWidth="2.5" strokeDasharray="9 7" />

        {/* 道路 */}
        {ROADS.map((road, index) => (
          <path key={`ro-${index}`} d={road.path} fill="none" stroke="#e3e9e2" strokeWidth={road.wide ? 11 : 6} strokeLinecap="round" />
        ))}
        {ROADS.map((road, index) => (
          <path key={`ri-${index}`} d={road.path} fill="none" stroke="#ffffff" strokeWidth={road.wide ? 7.5 : 4} strokeLinecap="round" />
        ))}

        {/* 建筑 */}
        {BUILDINGS.map((path, index) => (
          <path
            key={`b-${index}`}
            d={path}
            fill={CAMPUS_BUILDINGS[index].name ? '#dfe6e0' : '#eceeea'}
            stroke="#c8d2c8"
            strokeWidth="0.8"
          />
        ))}

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
          const showLabel = compact || isRoute || isActive || spot.kind === '入口' || Boolean(spot.mustSee);

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
              <circle cx={spot.x} cy={spot.y} r="26" className="map-hit" />
              <circle cx={spot.x} cy={spot.y} r="14" className="map-dot" />
              <text x={spot.x} y={spot.y + 5} textAnchor="middle" className="map-emoji">
                {spot.emoji}
              </text>
              {isRoute && !isOrigin ? (
                <g className="map-badge">
                  <circle cx={spot.x + 15} cy={spot.y - 15} r="10" />
                  <text x={spot.x + 15} y={spot.y - 11.5} textAnchor="middle">
                    {order}
                  </text>
                </g>
              ) : null}
              {isOrigin ? (
                <g className="map-badge map-badge--origin">
                  <circle cx={spot.x + 15} cy={spot.y - 15} r="10" />
                  <text x={spot.x + 15} y={spot.y - 11.5} textAnchor="middle">
                    起
                  </text>
                </g>
              ) : null}
              {showLabel ? (
                <text x={spot.x} y={spot.y + 30} textAnchor="middle" className="map-label">
                  {spot.name}
                </text>
              ) : null}
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
          <span className="map-legend-note">
            点击任意点位查看讲解 · {CAMPUS_ATTRIBUTION}
          </span>
        </div>
      ) : null}

      {visited.size === 0 && compact ? (
        <p className="map-empty">调整左侧条件后，路线会自动更新。</p>
      ) : null}
    </div>
  );
}
