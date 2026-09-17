<div align="center">
  <img src="https://raw.githubusercontent.com/beihaime/nova-mail/main/mail-vue/src/icons/svg/brand-app-dark.svg" alt="Nova Mail" width="96" />
</div>

# Nova Mail

[English](README.md) | 简体中文

[![MIT License](https://img.shields.io/github/license/beihaime/nova-mail?style=flat)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/beihaime/nova-mail?style=flat)](https://github.com/beihaime/nova-mail/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/beihaime/nova-mail?style=flat)](https://github.com/beihaime/nova-mail/network/members)
[![GitHub issues](https://img.shields.io/github/issues/beihaime/nova-mail?style=flat)](https://github.com/beihaime/nova-mail/issues)
[![Last commit](https://img.shields.io/github/last-commit/beihaime/nova-mail?style=flat)](https://github.com/beihaime/nova-mail/commits/main/)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?style=flat&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![pnpm](https://img.shields.io/badge/package%20manager-pnpm-f69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)

Nova Mail 是一个现代化 Web 邮件客户端，基于开源项目 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 开发。它保留了原项目基于 Cloudflare 的邮件处理流程，并加入 Nova Mail 品牌、前端 UI、多地址管理、OAuth 集成以及认证和安全相关改进。

## 项目预览

### 登录页面

![Nova Mail 登录页面](doc/demo/loginDemo.png)

### 邮件界面

![Nova Mail 邮件界面](doc/demo/webview.png)

## 功能特性

- 支持桌面端和移动端的响应式邮件界面
- 支持 Light / Dark 主题、Nova Mail 品牌和 PWA
- 支持收件箱、已发送、草稿、星标、归档、垃圾邮件、回收站、自定义文件夹和搜索
- 一个 Nova Mail 账户绑定多个邮箱地址，并支持地址切换和独立的地址管理页面
- 支持写信、回复、转发、标记已读/未读、星标、删除、归档、附件和邮件打印
- 使用 sanitizer 安全渲染富 HTML 邮件，同时支持纯文本邮件
- 支持 GitHub OAuth 登录和账户绑定
- 支持 Google OAuth/OIDC 登录和账户绑定
- 对受保护的账户操作使用 Cloudflare Turnstile 验证
- 支持带角色和权限的管理员用户与邮箱管理
- 使用 Cloudflare Email Workers 接收邮件，使用 Resend 发送邮件并接收状态 webhook，使用 R2 保存附件
- 可选的 Telegram 转发、Webhook 转发、Workers AI 验证码提取和分析功能
- English 和简体中文本地化

## 技术栈

### Frontend

- Vue 3 和 Vite
- Vue Router 和 Pinia
- Element Plus
- Iconify 与 Nova Mail SVG 图标资源
- DOMPurify，用于邮件 HTML 净化
- `vite-plugin-pwa`

### Backend 与基础设施

- 使用 Hono 的 Cloudflare Workers
- Cloudflare D1，用于应用数据
- Cloudflare KV，用于会话、临时 OAuth 授权和设置缓存
- Cloudflare R2，用于附件和对象存储
- Cloudflare Email Workers，用于接收邮件
- Resend，用于发信和投递状态 webhook
- Cloudflare Turnstile，用于机器人验证
- Cloudflare Workers AI，用于可选的验证码提取
- Drizzle ORM 和 Postal MIME

## 项目结构

```text
nova-mail/
├── mail-vue/                  # Vue 前端
│   ├── src/components/        # 共享 UI 组件
│   ├── src/layout/            # 应用外壳、Header 和 Sidebar
│   ├── src/router/            # Vue Router 路由
│   ├── src/store/             # Pinia stores
│   ├── src/views/             # 邮件、设置、登录、预览和管理页面
│   ├── src/icons/             # Nova Mail SVG 图标系统
│   ├── public/                # 静态资源和 PWA 图标
│   ├── package.json
│   └── vite.config.js
├── mail-worker/               # Cloudflare Worker 后端
│   ├── src/api/               # HTTP API 路由
│   ├── src/service/           # 认证、邮件、OAuth、存储和设置逻辑
│   ├── src/entity/            # D1/Drizzle 实体
│   ├── src/email/             # Cloudflare Email Worker 处理器
│   ├── src/security/          # 认证和权限中间件
│   ├── src/hono/              # Hono 应用配置
│   ├── src/index.js           # Worker 入口
│   ├── wrangler.toml          # 生产 Worker 配置
│   ├── wrangler-dev.toml      # 本地开发配置
│   └── package.json
├── doc/demo/                  # README 截图
├── LICENSE
└── README.md
```

## 本地开发

### 环境要求

- Node.js 18 或更高版本
- pnpm
- 用于 Worker、D1 和 KV 开发的 Cloudflare 账户

仓库包含独立的 frontend 和 Worker package，请分别安装依赖：

```bash
git clone https://github.com/beihaime/nova-mail.git
cd nova-mail

pnpm --dir mail-vue install
pnpm --dir mail-worker install
```

启动 Frontend 开发服务器：

```bash
pnpm --dir mail-vue dev
```

在另一个终端启动 Worker 开发环境：

```bash
pnpm --dir mail-worker dev
```

Frontend package 还提供：

```bash
pnpm --dir mail-vue build    # 生产 Frontend 构建
pnpm --dir mail-vue preview  # 预览构建结果
```

Worker package 提供 `dev`、`start`、`deploy` 和 `test` scripts。`test` script 使用测试环境的 Wrangler 部署配置；执行前请检查 `wrangler-test.toml`。

## 配置

Cloudflare bindings 和非敏感变量位于 `mail-worker/wrangler.toml` 及其环境配置中。常用设置包括：

- `domain`：允许使用的邮件域名
- `admin`：管理员邮箱
- `TURNSTILE_HOSTNAME`：Turnstile 验证使用的 hostname
- `ai_model`：可选的 Workers AI 模型

使用 Wrangler 配置 secrets，绝不要提交 secret 值：

```bash
cd mail-worker
pnpm wrangler secret put jwt_secret
pnpm wrangler secret put TURNSTILE_SECRET_KEY
pnpm wrangler secret put GITHUB_CLIENT_SECRET
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put resend_webhook_secret
```

其他公开/provider 配置通过现有设置流程管理；在适用的环境中，`GOOGLE_CLIENT_ID` 和 `GITHUB_CLIENT_ID` 也可以作为 Worker 环境变量提供。OAuth client secret 只应保留在服务端。

### OAuth callback URL

Worker 的 callback 路径为：

```text
https://<your-domain>/api/oauth/github/callback
https://<your-domain>/api/oauth/google/callback
```

请在 GitHub 和 Google provider 控制台中注册完整且精确的 URL。当前部署使用的 Google callback 为：

```text
https://mail.beihaime.com/api/oauth/google/callback
```

Google 登录只申请 OpenID Connect 身份 scopes（`openid`、`email` 和 `profile`）。Nova Mail 不会把 provider access token 放入浏览器或仓库。

## 部署

生产环境使用带 Static Assets 的 Cloudflare Worker。Frontend 构建输出位置由 `mail-worker/wrangler.toml` 中的 Worker asset 配置决定。

从 Worker 目录构建并部署：

```bash
cd mail-worker
pnpm deploy
```

部署前请检查所选 Wrangler 配置、D1 和 KV bindings、Static Assets 目录、自定义域名以及所需 secrets。数据库初始化和版本化 schema 由现有 Worker 初始化流程处理；不要重建或重置生产 D1 数据库。

Inbound mail 由 Worker Email handler 处理；Outbound delivery 和投递状态事件使用已配置的 Resend 集成。附件在提供 R2 对象前会校验所属用户的授权。

## 上游项目与致谢

Nova Mail 基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 开发。原项目及其作者根据原许可证继续获得 attribution。Nova Mail 在其基础上增加了自己的 branding、frontend/UI、认证和安全相关改进。

## 许可证

本项目使用 MIT License。

详见 [LICENSE](LICENSE)。仓库保留原始版权声明以及 Nova Mail 的修改版权声明。
