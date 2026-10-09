import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/haidian.css';

// Vite 负责把公开运行配置编译进前端；API Key 和 APP_TOKEN 不在这里出现。
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

// 注册离线缓存：校园里信号不稳时也能打开看点位。
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 注册失败不影响正常使用
    });
  });
}
