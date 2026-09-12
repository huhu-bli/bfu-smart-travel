import type { Spot, SpotKind } from '../types';

const THEMES: Record<SpotKind, [string, string]> = {
  入口: ['#1f7a4d', '#5bbd8b'],
  景观: ['#c98c14', '#f0cf6b'],
  建筑: ['#3b5b7a', '#7ea6c9'],
  场馆: ['#6a4a8f', '#b294d6'],
  科研: ['#1d6c76', '#67c0c6'],
  绿地: ['#27763a', '#8ed08a'],
  运动: ['#c05a2b', '#f2a679'],
  餐饮: ['#b0442f', '#f0a08a'],
};

interface Props {
  spot: Spot;
  size?: 'sm' | 'md' | 'lg';
}

export default function SpotArt({ spot, size = 'md' }: Props) {
  const [from, to] = THEMES[spot.kind];
  return (
    <div
      className={`spot-art spot-art--${size}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden="true"
    >
      <span className="spot-art-ring" />
      <span className="spot-art-emoji">{spot.emoji}</span>
      <span className="spot-art-kind">{spot.kind}</span>
    </div>
  );
}
