import type { BeijingPlace } from '../types';
import type { PlaceMetadata } from '../lib/placeRepository';

export default function VisitInfo({ place }: { place: BeijingPlace & PlaceMetadata }) {
  // 旧路线快照可能尚未校验这些新增字段，不能直接渲染任意缓存对象。
  const hours = typeof place.openingHours === 'string' && place.openingHours.trim()
    ? place.openingHours : '尚未核实，请查看官方公告。';
  let url: URL | undefined;
  try {
    const candidate = typeof place.bookingUrl === 'string' ? new URL(place.bookingUrl) : undefined;
    if (candidate?.protocol === 'https:' && !candidate.username && !candidate.password) url = candidate;
  } catch { /* 没有可用的官方链接时保留文字提示。 */ }
  return <details>
    <summary>开放与预约信息</summary>
    <p>{hours}</p>
    {url ? <p><a href={url.href} target="_blank" rel="noopener noreferrer">官方票务与参观说明</a></p> : null}
  </details>;
}
