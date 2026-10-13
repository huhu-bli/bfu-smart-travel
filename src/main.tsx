import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/haidian.css';

// Vite 只注入浏览器运行配置；千问 API Key 和 APP_TOKEN 绝不进入前端。
(globalThis as { __BFU_ENV__?: Record<string, string> }).__BFU_ENV__ = {
  VITE_AGENT_PROXY_URL: import.meta.env.VITE_AGENT_PROXY_URL ?? '',
  VITE_AMAP_KEY: import.meta.env.VITE_AMAP_KEY ?? '',
  VITE_AMAP_SECURITY_CODE: import.meta.env.VITE_AMAP_SECURITY_CODE ?? '',
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 注册离线缓存：出行途中信号不稳时也能打开已加载页面。
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 注册失败不影响正常使用
    });
  });
}
