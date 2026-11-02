import catalog from '../../../database/catalogs/ustb-campus-2026-11-01.json';
import type { InterestId, Spot, SpotKind } from '../../types';

/** 仅学院路主校区；与数据库批次共用资料，示意坐标不是测绘导航。 */
export const USTB_SPOTS: Spot[] = catalog.places.map((place) => ({
  id: place.id, name: place.name, aliases: place.aliases, kind: place.category as SpotKind,
  emoji: place.emoji, x: place.x, y: place.y, visit: place.visit,
  interests: place.interests as InterestId[], short: place.short,
  description: place.description, highlights: place.highlights,
  bestTime: place.bestTime, tips: place.tips, mustSee: place.mustSee,
}));
