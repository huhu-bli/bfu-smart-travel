const NAV = [
  { id: 'planner', label: '智能路线' },
  { id: 'map', label: '校园地图' },
  { id: 'spots', label: '点位图鉴' },
  { id: 'trips', label: '周边一日游' },
  { id: 'packing', label: '出行清单' },
] as const;

export type TabId = (typeof NAV)[number]['id'];

interface Props {
  tab: TabId;
  onChange: (tab: TabId) => void;
  repoUrl: string;
}

export default function Header({ tab, onChange, repoUrl }: Props) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="brand" onClick={() => onChange('planner')} type="button">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <defs>
                <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#2fa36a" />
                  <stop offset="1" stopColor="#14563a" />
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="18" fill="url(#brand-g)" />
              <path d="M32 13c9 6 14 13 14 21a14 14 0 0 1-28 0c0-8 5-15 14-21z" fill="#f4d06f" />
              <path
                d="M32 23v25M32 32l-7-6M32 39l7-6"
                stroke="#0f3f2a"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </span>
          <span className="brand-text">
            <strong>北林智能旅行</strong>
            <small>BFU Smart Travel</small>
          </span>
        </button>

        <nav className="site-nav" aria-label="主导航">
          {NAV.slice(0, 2).map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === tab ? 'nav-pill is-active' : 'nav-pill'}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div className="nav-secondary">
            {NAV.slice(2).map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === tab ? 'nav-pill is-active' : 'nav-pill'}
                onClick={() => onChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <details className={tab !== 'planner' && tab !== 'map' ? 'nav-more is-active' : 'nav-more'}>
            <summary>更多</summary>
            <div className="nav-more-menu">
              {NAV.slice(2).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === tab ? 'nav-more-item is-active' : 'nav-more-item'}
                  onClick={() => onChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </details>
        </nav>

        <a className="gh-link" href={repoUrl} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
            />
          </svg>
          GitHub
        </a>
      </div>
    </header>
  );
}
