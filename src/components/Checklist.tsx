import { useLocalStorage, toggleInList } from '../lib/storage';

const CATEGORIES = [
  {
    id: 'doc',
    emoji: '🪪',
    title: '证件与预约',
    items: ['身份证 / 学生证', '入校预约凭证', '景区门票预约截图', '校园卡或临时卡'],
  },
  {
    id: 'gear',
    emoji: '🎒',
    title: '随身装备',
    items: ['舒适的运动鞋', '水杯 / 矿泉水', '充电宝与数据线', '相机或手机', '薄外套'],
  },
  {
    id: 'weather',
    emoji: '☀️',
    title: '天气与防护',
    items: ['防晒霜', '遮阳帽或晴雨伞', '驱蚊液（夏季）', '口罩与纸巾'],
  },
  {
    id: 'plan',
    emoji: '🗺️',
    title: '行程准备',
    items: ['确认场馆开放时间', '保存离线地图', '约定集合时间与地点', '准备少量现金'],
  },
  {
    id: 'safety',
    emoji: '🛡️',
    title: '安全与礼仪',
    items: ['遵守校园管理规定', '不进入实验与封控区域', '保持安静、不影响上课', '垃圾随身带走', '山区禁止用火'],
  },
];

const TOTAL = CATEGORIES.reduce((sum, category) => sum + category.items.length, 0);

export default function Checklist() {
  const [checked, setChecked] = useLocalStorage<string[]>('packing', []);
  const progress = Math.round((checked.length / TOTAL) * 100);

  return (
    <section className="checklist">
      <div className="gallery-head">
        <div>
          <h2>出行清单</h2>
          <p>勾选会自动保存在本机浏览器里，下次打开还在。</p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => setChecked([])}>
          全部清空
        </button>
      </div>

      <div className="progress">
        <div className="progress-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-text">
          {checked.length} / {TOTAL} 已准备（{progress}%）
        </span>
      </div>

      <div className="check-grid">
        {CATEGORIES.map((category) => (
          <div key={category.id} className="check-card">
            <h3>
              <span>{category.emoji}</span>
              {category.title}
            </h3>
            <ul>
              {category.items.map((item) => {
                const key = `${category.id}:${item}`;
                const done = checked.includes(key);
                return (
                  <li key={key}>
                    <label className={done ? 'check-item is-done' : 'check-item'}>
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => setChecked((prev) => toggleInList(prev, key))}
                      />
                      <span>{item}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
