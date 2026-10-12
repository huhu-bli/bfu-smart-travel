interface Props {
  repoUrl: string;
}

export default function Footer({ repoUrl }: Props) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <strong>北京智能旅行</strong>
          <p>
            北京综合地图与校园地图用于旅行发现和路线参考，交通、停留时长与距离为估算值。实时路况、预约、入校政策、开放时间与票价请以地图导航和官方公告为准。
          </p>
        </div>
        <div className="footer-links">
          <a href={repoUrl} target="_blank" rel="noreferrer">
            项目源码
          </a>
          <a href={repoUrl + '#readme'} target="_blank" rel="noreferrer">
            平台说明
          </a>
        </div>
      </div>
    </footer>
  );
}
