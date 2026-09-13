# AI 行程助手代理（Cloudflare Workers）

前端是纯静态站点，直连模式会把 API Key 放在浏览器里，只适合自己用。要让同学都能用，就把密钥放到这个代理里。

## 部署（约 3 分钟）

```bash
cd worker
npx wrangler login
npx wrangler secret put OPENAI_API_KEY     # 粘贴你的密钥（DeepSeek 或 OpenAI 的都可以）
npx wrangler secret put UPSTREAM_BASE      # 用 DeepSeek 就填 https://api.deepseek.com
npx wrangler secret put APP_TOKEN          # 自己设一个口令，例如 bfu-travel-2026
npx wrangler deploy
```

默认上游是 `https://api.openai.com/v1`（OpenAI）。改用 DeepSeek 只需要把 `UPSTREAM_BASE` 设为 `https://api.deepseek.com`，前端把服务商切成 DeepSeek 即可。

`deploy` 完成后会输出一个地址，形如 `https://bfu-smart-travel-agent.<你的子域>.workers.dev`。

（可选）限制可用模型：

```bash
npx wrangler secret put ALLOWED_MODELS     # 例如 deepseek-chat,deepseek-reasoner
```

Worker 只接受两个路径：`/responses`（OpenAI Responses API）和 `/chat/completions`（DeepSeek 等 OpenAI 兼容接口），其余路径一律 404。

### 限流（防止共享额度被刷）

Worker 内置了限流，不用额外配置就有默认值：

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `IP_LIMIT` | 20 | 单个 IP 在时间窗内的请求上限 |
| `IP_WINDOW_MS` | 600000 | 单 IP 时间窗（10 分钟） |
| `GLOBAL_LIMIT` | 200 | 全局时间窗内的请求上限，兜住额度被刷 |
| `GLOBAL_WINDOW_MS` | 3600000 | 全局时间窗（1 小时） |

超限时返回 `429`，前端会显示「你问得有点快，休息一会儿再来吧」。计数器存放在 Worker isolate 的内存里，对脚本刷量足够，但不是分布式精确限流；要更严格可以再加 Cloudflare 的 Rate limiting 绑定。

## 在前端使用

打开应用右下角的「AI 行程助手」→ ⚙ 设置 → 切到 **代理（可公开）** → 填代理地址和访问口令。

## 说明

- `OPENAI_API_KEY` 只存在于 Cloudflare 环境变量中，不会进入浏览器，也不要在仓库里提交任何密钥。
- `APP_TOKEN` 是放在前端的，能挡住随手调用，但挡不住有心人。真正要防止滥用，请在 Cloudflare 控制台给它加 **Rate limiting** 规则，并在 OpenAI 后台设置**用量上限**。
- Worker 只转发 Responses API 需要的字段，不接收其它接口和自定义 header，避免被当成开放代理。
