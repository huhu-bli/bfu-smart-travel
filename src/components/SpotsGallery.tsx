import { useMemo, useState } from 'react';
import { INTERESTS, INTEREST_MAP } from '../data/interests';
import type { InterestId, Spot } from '../types';
import SpotArt from './SpotArt';

interface Props {
  spots: Spot[];
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelect: (id: string) => void;
}

type Filter = 'all' | InterestId | 'fav';

export default function SpotsGallery({ spots, favorites, onToggleFavorite, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [keyword, setKeyword] = useState('');

  const list = useMemo(() => {
    const text = keyword.trim();
    return spots.filter((spot) => {
      const matchFilter =
        filter === 'all'
          ? true
          : filter === 'fav'
            ? favorites.includes(spot.id)
            : spot.interests.includes(filter);
      const matchText =
        !text ||
        spot.name.includes(text) ||
        spot.short.includes(text) ||
        spot.highlights.some((highlight) => highlight.includes(text));
      return matchFilter && matchText;
    });
  }, [spots, filter, favorites, keyword]);

  return (
    <section className="gallery">
      <div className="gallery-head">
        <div>
          <h2>校园点位图鉴</h2>
          <p>共 {spots.length} 个点位，点开卡片可以看到讲解、亮点与最佳观赏时间。</p>
        </div>
        <input
          className="search"
          value={keyword}
          placeholder="搜索点位、亮点，例如「银杏」"
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      <div className="filter-row">
        <button type="button" className={filter === 'all' ? 'chip chip--sm is-active' : 'chip chip--sm'} onClick={() => setFilter('all')}>
          全部
        </button>
        {INTERESTS.map((interest) => (
          <button
            key={interest.id}
            type="button"
            className={filter === interest.id ? 'chip chip--sm is-active' : 'chip chip--sm'}
            onClick={() => setFilter(interest.id)}
          >
            {interest.emoji} {interest.label}
          </button>
        ))}
        <button
          type="button"
          className={filter === 'fav' ? 'chip chip--sm is-active' : 'chip chip--sm'}
          onClick={() => setFilter('fav')}
        >
          ⭐ 我的收藏 {favorites.length ? `(${favorites.length})` : ''}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="empty-state">没有匹配的点位，换个关键词试试。</p>
      ) : (
        <div className="spot-grid">
          {list.map((spot) => (
            <article key={spot.id} className="spot-card">
              <button type="button" className="spot-card-main" onClick={() => onSelect(spot.id)}>
                <SpotArt spot={spot} />
                <div className="spot-card-body">
                  <div className="spot-card-top">
                    <h3>{spot.name}</h3>
                    {spot.mustSee ? <span className="badge">必看</span> : null}
                  </div>
                  <p>{spot.short}</p>
                  <div className="tag-row">
                    {spot.interests.map((id) => (
                      <span key={id} className="tag">
                        {INTEREST_MAP[id]?.emoji} {INTEREST_MAP[id]?.label}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
              <button
                type="button"
                className={favorites.includes(spot.id) ? 'fav-btn is-on' : 'fav-btn'}
                aria-label={favorites.includes(spot.id) ? '取消收藏' : '收藏'}
                onClick={() => onToggleFavorite(spot.id)}
              >
                {favorites.includes(spot.id) ? '★' : '☆'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
