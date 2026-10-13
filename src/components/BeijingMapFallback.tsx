import { BEIJING_PLACES } from '../data/beijingPlaces';
import type { BeijingPlace, BeijingRoutePlan } from '../types';

interface Props {
  places: BeijingPlace[];
  plan: BeijingRoutePlan | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const width = 800;
const height = 500;
const padding = 38;
const longitudes = BEIJING_PLACES.map((place) => place.lng);
const latitudes = BEIJING_PLACES.map((place) => place.lat);
const minLng = Math.min(...longitudes);
const maxLng = Math.max(...longitudes);
const minLat = Math.min(...latitudes);
const maxLat = Math.max(...latitudes);

function position(place: BeijingPlace): [number, number] {
  return [
    padding + ((place.lng - minLng) / (maxLng - minLng)) * (width - padding * 2),
    height - padding - ((place.lat - minLat) / (maxLat - minLat)) * (height - padding * 2),
  ];
}

/** 高德无法使用时，仍可查看站点的相对位置和计划顺序。线段不是实际道路。 */
export default function BeijingMapFallback({ places, plan, selectedId, onSelect }: Props) {
  const route = plan ? [plan.origin, ...plan.stops.map((stop) => stop.place)] : [];
  const sequence = new Map(route.map((place, index) => [place.id, index + 1]));
  const visible = [...places, ...route.filter((place) => !places.some((item) => item.id === place.id))];

  return (
    <svg className="beijing-fallback-map" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="北京景点位置示意图，路线为直线连接">
      <rect width={width} height={height} fill="#eaf3ff" />
      {[1, 2, 3, 4].map((index) => (
        <g key={index} stroke="#cdddf2" strokeWidth="1">
          <path d={`M 0 ${index * 100} H ${width}`} />
          <path d={`M ${index * 160} 0 V ${height}`} />
        </g>
      ))}
      {route.length > 1 ? (
        <polyline
          points={route.map((place) => position(place).join(',')).join(' ')}
          fill="none"
          stroke="#5379ad"
          strokeWidth="4"
          strokeDasharray="9 7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {visible.map((place) => {
        const [x, y] = position(place);
        const index = sequence.get(place.id);
        const selected = selectedId === place.id;
        return (
          <g
            key={place.id}
            className="beijing-fallback-point"
            role="button"
            tabIndex={0}
            aria-label={`查看${place.name}`}
            onClick={() => onSelect(place.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(place.id);
              }
            }}
          >
            <circle cx={x} cy={y} r={index ? 16 : selected ? 10 : 7} fill={index ? '#155fbe' : '#60a5fa'} stroke="#fff" strokeWidth="3" />
            {index ? <text x={x} y={y + 5} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">{index}</text> : null}
            {(index || selected) ? <text x={x} y={y - 22} textAnchor="middle" fill="#173d6d" fontSize="12" fontWeight="700">{place.name}</text> : null}
            <title>{place.name} · {place.district}</title>
          </g>
        );
      })}
      <text x="22" y="30" fill="#244f81" fontSize="14" fontWeight="700">北京目的地 · 相对位置示意</text>
      <text x={width - 20} y={height - 17} textAnchor="end" fill="#486889" fontSize="12">非道路导航图</text>
    </svg>
  );
}
