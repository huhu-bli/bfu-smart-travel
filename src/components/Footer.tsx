interface Props {
  repoUrl: string;
}

export default function Footer({ repoUrl }: Props) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <strong>北林智能旅行</strong>
          <p>
            校园点位、距离与时长均为示意数据，地图为示意图而非测绘成果。入校政策、场馆开放时间与票价请以学校和景区最新公告为准。
          </p>
        </div>
        <div className="footer-links">
          <a href={repoUrl} target="_blank" rel="noreferrer">
            项目源码
          </a>
          <a href="https://www.bjfu.edu.cn/" target="_blank" rel="noreferrer">
            北京林业大学
          </a>
        </div>
      </div>
    </footer>
  );
}
