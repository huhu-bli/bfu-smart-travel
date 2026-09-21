# 通义千问 AI 行程助手代理（Cloudflare Workers）

前端公开部署时只请求这个 Worker，通义千问 API Key 只保存在 Cloudflare Worker Secret 中，不会进入网页源码，也不会提交到 GitHub。

## 部署

~~~powershell
cd worker
npx wrangler login
npx wrangler secret put QWEN_API_KEY
npx wrangler secret put APP_TOKEN
npx wrangler deploy
~~~

部署完成后会输出 Worker 地址，例如：

https://bfu-smart-travel-agent.<你的子域>.workers.dev

在 GitHub 仓库的 Actions Variables 或 Secrets 中配置：

| 名称 | 内容 |
| --- | --- |
| AGENT_PROXY_TOKEN | 与 Worker 的 APP_TOKEN 完全一致 |

公开站点的 Worker 地址已经写入 Pages 工作流；访问口令只在构建时注入，不写入仓库文件。

## 接口

- GET /：健康检查，供前端“测试连接”使用。
- POST /chat/completions：通义千问 Chat Completions 请求。
- OPTIONS：跨域预检。

Worker 固定请求：

https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions

不再支持 OpenAI、DeepSeek、Responses API 或任意自定义上游地址。

## 限流

Worker 默认限制共享额度，防止公开站点被刷：

| 变量 | 默认值 | 含义 |
| --- | ---: | --- |
| IP_LIMIT | 20 | 单个 IP 在时间窗内的请求上限 |
| IP_WINDOW_MS | 600000 | 单 IP 时间窗（10 分钟） |
| GLOBAL_LIMIT | 200 | 全局时间窗内的请求上限 |
| GLOBAL_WINDOW_MS | 3600000 | 全局时间窗（1 小时） |

也可以设置 ALLOWED_MODELS，例如 qwen3.8-flash,qwen-plus。

## 前端使用

公开站点首次加载时会自动选择“代理”模式。旧版本保存在浏览器里的直连配置也会自动迁移到当前 Worker，避免继续请求 DashScope。

本地开发没有站点代理配置时，可以在 AI 设置中手动填写自己的千问 API Key；该方式只建议个人调试，不要用于公开部署。
