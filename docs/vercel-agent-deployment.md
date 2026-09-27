# Vercel 千问代理部署

前端继续部署在 GitHub Pages，千问请求由 Vercel Serverless Function 转发。

## 配置

在 Vercel 导入仓库 `huhu-bli/bfu-smart-travel`，保持根目录为仓库根目录。Vercel 会自动识别 `api/chat/completions.mjs`。

在 Vercel 项目 Settings → Environment Variables 添加：

- `QWEN_API_KEY`：阿里云百炼的通义千问 API Key
- `APP_TOKEN`：自定义访问口令

不要把千问 API Key 写入 GitHub 仓库。

## GitHub Pages 配置

部署 Vercel 后，在 GitHub 仓库 Settings → Secrets and variables → Actions → Variables 添加：

- `AGENT_PROXY_URL`：`https://你的项目名.vercel.app/api`

在 Secrets 中添加：

- `AGENT_PROXY_TOKEN`：与 Vercel 的 `APP_TOKEN` 完全相同

然后重新运行 **Deploy to GitHub Pages** 工作流。

## 测试

打开 `https://你的项目名.vercel.app/` 应看到健康检查 JSON；再打开 GitHub Pages，测试：

> 我只有 1 小时，从东门进，怎么逛最值？

如果仍然出现内置助手，检查 Vercel Production 环境变量、访问口令和 GitHub Actions 是否重新运行。
