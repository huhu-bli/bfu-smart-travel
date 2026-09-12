# AI 行程助手代理（Cloudflare Workers）

前端是纯静态站点，直连模式会把 API Key 放在浏览器里，只适合自己用。要让同学都能用，就把密钥放到这个代理里。

## 部署（约 3 分钟）

```bash
cd worker
npx wrangler login
npx wrangler secret put OPENAI_API_KEY     # 粘贴你的 OpenAI 密钥
npx wrangler secret put APP_TOKEN          # 自己设一个口令，例如 bfu-travel-2026
npx wrangler deploy
```

`deploy` 完成后会输出一个地址，形如 `https://bfu-smart-travel-agent.<你的子域>.workers.dev`。

（可选）限制可用模型：

```bash
npx wrangler secret put ALLOWED_MODELS     # 例如 gpt-6-astra,gpt-5.6
```

## 在前端使用

打开应用右下角的「AI 行程助手」→ ⚙ 设置 → 切到 **代理（可公开）** → 填代理地址和访问口令。

## 说明

- `OPENAI_API_KEY` 只存在于 Cloudflare 环境变量中，不会进入浏览器，也不要在仓库里提交任何密钥。
- `APP_TOKEN` 是放在前端的，能挡住随手调用，但挡不住有心人。真正要防止滥用，请在 Cloudflare 控制台给它加 **Rate limiting** 规则，并在 OpenAI 后台设置**用量上限**。
- Worker 只转发 Responses API 需要的字段，不接收其它接口和自定义 header，避免被当成开放代理。
