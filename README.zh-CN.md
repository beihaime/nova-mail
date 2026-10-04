<div align="center">
  <img
    src="https://raw.githubusercontent.com/beihaime/nova-mail/main/mail-vue/src/icons/svg/brand-app-dark.svg"
    alt="Nova Mail"
    width="96"
  />

  <h1>Nova Mail</h1>

  <p>
    <a href="README.md">English</a> · <b>简体中文</b>
  </p>

  <p>
    <a href="LICENSE">
      <img src="https://img.shields.io/github/license/beihaime/nova-mail?style=flat" alt="MIT License">
    </a>
    <a href="https://github.com/beihaime/nova-mail/stargazers">
      <img src="https://img.shields.io/github/stars/beihaime/nova-mail?style=flat" alt="GitHub stars">
    </a>
    <a href="https://github.com/beihaime/nova-mail/network/members">
      <img src="https://img.shields.io/github/forks/beihaime/nova-mail?style=flat" alt="GitHub forks">
    </a>
    <a href="https://github.com/beihaime/nova-mail/issues">
      <img src="https://img.shields.io/github/issues/beihaime/nova-mail?style=flat" alt="GitHub issues">
    </a>
    <a href="https://github.com/beihaime/nova-mail/commits/main/">
      <img src="https://img.shields.io/github/last-commit/beihaime/nova-mail?style=flat" alt="Last commit">
    </a>
    <a href="https://github.com/beihaime/nova-mail/commits/main/">
      <img src="https://img.shields.io/github/commit-activity/t/beihaime/nova-mail?style=flat&label=total%20commits" alt="Total commits">
    </a>
  </p>

  <p>
    <a href="https://vuejs.org/">
      <img src="https://img.shields.io/badge/Vue-3-42b883?style=flat&logo=vuedotjs&logoColor=white" alt="Vue 3">
    </a>
    <a href="https://developers.cloudflare.com/workers/">
      <img src="https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat&logo=cloudflare&logoColor=white" alt="Cloudflare Workers">
    </a>
    <a href="https://pnpm.io/">
      <img src="https://img.shields.io/badge/package%20manager-pnpm-f69220?style=flat&logo=pnpm&logoColor=white" alt="pnpm">
    </a>
  </p>

  <p>
    <a href="#功能">功能</a> ·
    <a href="#架构">架构</a> ·
    <a href="#部署">部署</a> ·
    <a href="#配置参考">配置</a> ·
    <a href="#安全说明">安全</a> ·
    <a href="#本地开发">开发</a> ·
    <a href="#贡献">贡献</a>
  </p>
</div>

Nova Mail 是部署在 Cloudflare Workers 上的自托管 Web 邮件应用。它由 Vue 3 客户端和 Worker 组成：Worker 通过 Cloudflare Email Routing 接收邮件，在 D1 中保存邮箱数据，并在边缘提供应用静态资源。

> **Fork 说明：** Nova Mail 基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 演进而来。[MIT License](LICENSE) 保留原项目的版权声明以及 Nova Mail 的修改版权声明。

[报告问题](https://github.com/beihaime/nova-mail/issues) · [MIT License](LICENSE)

## 预览

![Nova Mail 登录页](doc/demo/loginDemo.png)

![Nova Mail 邮箱界面](doc/demo/webview.png)

## 功能

### 邮件

- 基于会话的收件箱与阅读器，支持折叠引用回复和实时更新回复内容。
- 收件箱、已发送、草稿、星标、归档和回收站；支持搜索、排序、已读/未读、批量操作，以及可撤销的归档、移入回收站和恢复操作。
- 支持写信、回复、回复全部、转发、抄送/密送、打印、附件，以及 Nova Mail 地址之间的站内投递。
- 支持 HTML、Markdown 与纯文本渲染；代码块可展示语言、行号、语法高亮和复制按钮。
- 可从本地身份、BIMI、Gravatar 或发件人注册域名解析头像。
- 支持入站过滤、可选自动清理、转发到邮箱/Telegram/Webhook，以及可选的 Workers AI 验证码提取。

### 使用体验

- 响应式桌面端与移动端布局，支持自定义移动端左滑/右滑执行归档或移入回收站。
- 可安装的 PWA，支持自适应主题色和可选的 Web Push 通知。
- 丰富的主题系统：支持浅色、深色和跟随系统模式，提供多种内置配色主题、自定义主题，以及主题导入/导出。
- 支持紧凑/普通邮件列表密度、12/24 小时时间格式、通知音效，以及英文/简体中文界面。
- 桌面端支持搜索、导航、选择、写信、邮箱操作和邮件阅读等键盘快捷键；可在应用内按 `?` 查看快捷键说明。

### 账户与管理

- 一个账户可管理多个邮箱地址，支持地址切换和逐地址收信控制。
- 支持密码登录；配置后可使用 GitHub、Google 和 Linux DO OAuth 登录或绑定账户。
- 支持设备/会话列表、逐个撤销、撤销其他会话，以及可选的邮件或 Telegram 登录提醒。
- 支持账户删除和基于角色的权限控制。
- 管理后台默认入口为 [`/admin`](/admin)，提供数据分析、用户与账户、全部邮件、角色、邀请码和系统设置。

## 发送 HTML 与 Markdown 邮件

Nova Mail 根据保存的正文类型选择阅读器：HTML 会先净化，再在沙箱 iframe 中预览；Markdown 使用 `markdown-it` 渲染；纯文本会转义。收件箱预览会展平为文本。

请将 `Content-Type` 放在邮件头中，留一个空行后再写正文。发送 HTML 邮件时，建议使用 `multipart/alternative`，并先提供纯文本备选：

```text
From: Tester <tester@example.com>
To: you@example.com
Subject: HTML preview
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="nova-demo"

--nova-demo
Content-Type: text/plain; charset=utf-8

Hello from Nova Mail

--nova-demo
Content-Type: text/html; charset=utf-8

<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:sans-serif">
    <h1>HTML preview</h1>
    <p>This message renders as <strong>HTML</strong>.</p>
    <a href="https://example.com">Open example.com</a>
  </body>
</html>
--nova-demo--
```

同样支持 `text/markdown`。不要把完整原始邮件嵌入另一封邮件正文。远程图片需要读者确认后才加载；脚本、事件属性、外部样式表和不安全 URL 会在 HTML 预览前被移除。

代码块的识别规则、支持的语言、渲染示例与安全模型，请参阅[代码块与语法高亮说明](doc/CODE_HIGHLIGHTING.zh-CN.md)。

## 架构

```text
入站邮件
  Cloudflare Email Routing
          |
          v
  Nova Mail Worker ── Postal MIME 解析 ── D1（用户、邮件、设置、会话）
          |                                  |
          |                                  +── KV（会话、缓存、对象存储回退）
          +── R2 或 S3（可选附件存储）       +── Web Push 订阅
          +── Telegram / 邮件转发 / HTTPS Webhook（可选）

Web 客户端 ── 由 Worker Static Assets 提供的 Vue 3 SPA ── Worker API

出站邮件 ── Cloudflare Email Sending，或按发件域配置的 Resend
认证 ── 密码 + 可选 GitHub / Google / Linux DO OAuth
```

Worker 还会每小时执行一次定时任务，用于维护、计数器、延迟收信完成、清理、OAuth 清理和分析缓存刷新。

## 技术栈

| 范围 | 当前实现 |
| --- | --- |
| 客户端 | Vue 3、Vite、Vue Router、Pinia、Element Plus、Vue I18n |
| 邮件界面 | TinyMCE、DOMPurify、markdown-it、highlight.js、ECharts |
| 边缘/API | Cloudflare Workers、Hono、Wrangler |
| 数据 | Cloudflare D1（Drizzle ORM）和 Cloudflare KV |
| 对象存储 | 已绑定时使用 Cloudflare R2；配置后使用兼容 S3 的存储；否则回退到 KV |
| 邮件 | Cloudflare Email Routing、Cloudflare Email Sending、Postal MIME、Resend |
| 身份与防护 | JWT 服务端会话、Turnstile、GitHub/Google/Linux DO OAuth、Web Push/VAPID |
| 可选处理 | Cloudflare Workers AI、Telegram、出站 HTTPS Webhook |

## 部署

### 前置条件

- Node.js 20 或更新版本，以及 pnpm 12（仓库固定为 `pnpm@12.4.2`）。
- 已启用 Workers、D1 和 KV 的 Cloudflare 账户。
- 若要收信或使用自定义域名，需要已验证的 Cloudflare Zone。

克隆并安装 workspace：

```bash
git clone https://github.com/beihaime/nova-mail.git
cd nova-mail
pnpm install
```

### 1. 创建并绑定 Cloudflare 资源

创建 D1 数据库和 KV 命名空间，再将返回的 ID 写入 `mail-worker/wrangler.toml`。绑定名是应用契约的一部分，必须保持为 `db` 和 `kv`。

```bash
cd mail-worker
pnpm wrangler d1 create nova-mail
pnpm wrangler kv namespace create nova-mail
```

在 `wrangler.toml` 的 `[[d1_databases]]` 中设置 `database_name`/`database_id`，并在 `[[kv_namespaces]]` 中设置 `id`。在 `[vars]` 配置非敏感变量：

```toml
[vars]
domain = ["example.com"]
admin = "admin@example.com"
TURNSTILE_HOSTNAME = "mail.example.com"
```

`domain` 是 Nova Mail 可管理的邮件域名数组。`admin` 必须是将创建或使用为管理员的邮箱地址。若使用自定义主机名，请在手动维护的 Wrangler 配置中加入对应的 `[[routes]]` 条目；使用仓库工作流时则填写 `CUSTOM_DOMAIN`。初次部署可先使用 Worker 的 `workers.dev` 地址。

R2 为可选项：只有需要 R2 Bucket 时才取消注释并填写 `r2` binding。未配置 R2 或 S3 时，附件会使用 KV 存储。现有 `[ai]` binding 用于可选 Workers AI；除非在系统设置中启用验证码提取，否则无需设置 `ai_model`。

### 2. 添加 Worker Secrets

凭据必须使用 Worker secret；不要放进 `[vars]`、仓库或客户端构建产物。以下命令在 `mail-worker` 目录执行：

```bash
pnpm wrangler secret put jwt_secret
pnpm wrangler secret put BOOTSTRAP_TOKEN
pnpm wrangler secret put TURNSTILE_SECRET_KEY
```

`jwt_secret` 与 `BOOTSTRAP_TOKEN` 必须是彼此独立的随机值；bootstrap token 至少 32 个字符，且只用于初始化新数据库。仅在启用相应功能时添加该功能所需的其他 secret。

### 3. 构建、部署并初始化新数据库

`wrangler.toml` 会在部署时将 Vue 应用构建到 `mail-worker/dist`：

```bash
pnpm deploy
```

对已部署的 Worker URL 仅调用一次 bootstrap 端点。该端点会执行 `src/init/init.js` 中定义的完整 schema，并原子性地消耗 bootstrap token。

```bash
curl --fail-with-body -X POST https://<worker-or-custom-host>/api/bootstrap \
  -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN"
```

已初始化的安装会返回 HTTP 409。不要为重新使用该端点而重置生产数据库；初始化成功后应删除或轮换 `BOOTSTRAP_TOKEN`。

### 4. 升级已有数据库

新安装使用 bootstrap。已有安装必须在部署依赖新 schema 的代码前，仅应用尚未存在的 migration。当前单独提供的 migration 位于 `mail-worker/migrations/`：

```bash
# 在 mail-worker 目录执行；替换为实际的 D1 数据库 ID 或名称。
pnpm wrangler d1 execute <D1_DATABASE> --remote --file migrations/v3_8_body_type.sql
pnpm wrangler d1 execute <D1_DATABASE> --remote --file migrations/v3_10_archived.sql
pnpm wrangler d1 execute <D1_DATABASE> --remote --file migrations/v3_11_trash.sql
pnpm wrangler d1 execute <D1_DATABASE> --remote --file migrations/v3_13_sessions.sql
pnpm wrangler d1 execute <D1_DATABASE> --remote --file migrations/v3_14_user_preferences.sql
```

不要盲目重复执行 v3.8、v3.10 或 v3.11：SQLite 不支持 `ADD COLUMN IF NOT EXISTS`。先通过 `pragma_table_info` 检查，再只应用缺失的变更。GitHub Actions 部署工作流在具备 D1 写权限时，会对后续邮件、会话和偏好迁移进行受控检查。

### 5. 配置邮件路由与发信

收信时，请在 Cloudflare 验证域名、启用 **Email Routing**、创建要由 Nova Mail 接收的地址或 catch-all，并选择 **Send to a Worker**，目标选择本 Worker。`domain` 列表和用户地址权限都必须包含收件人域名。

发信可选择以下一种方式：

- 在 Wrangler 中将 Cloudflare Email Sending 绑定为 `email`，使用 Cloudflare 发信 API。
- 或在 **管理后台 → 系统设置** 中，为每个发件域添加 Resend API token。向站外地址发信需要已配置的发信服务；Nova Mail 地址之间的站内投递不需要。

Resend 投递状态 webhook 的接收地址是 `/api/webhooks`；将 webhook 签名 secret 配置为 Worker secret `resend_webhook_secret`。

### 6. 配置可选登录与通知

在 OAuth 提供商处登记下列精确回调地址，并替换主机名：

```text
https://<host>/api/oauth/github/callback
https://<host>/api/oauth/google/callback
https://<host>/api/oauth/linuxdo/callback
```

GitHub 使用 `GITHUB_CLIENT_ID` 与 `GITHUB_CLIENT_SECRET` Worker binding。Google 可使用 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` binding，或管理员配置的 Google OAuth 设置；按需在系统设置中启用提供商。Google 使用 OpenID Connect 的 `openid`、`email` 和 `profile` scopes。

Turnstile 需要 `TURNSTILE_SECRET_KEY` 和正确的 `TURNSTILE_HOSTNAME`。要启用 Web Push，请使用提供的脚本生成 VAPID 密钥对：

```bash
node scripts/generate-vapid-keys.mjs
pnpm wrangler secret put vapid_public_key
pnpm wrangler secret put vapid_private_key
pnpm wrangler secret put vapid_subject
```

Telegram、S3 兼容对象存储、转发、Webhook、黑名单规则、Resend token 和 AI 验证码提取均在 **系统设置** 中由管理员配置。Webhook 仅允许 HTTPS，Worker 会拒绝不安全的字面 IP 范围且不跟随重定向；若需要防范 DNS rebinding，请使用 allowlist 或受控 egress。

### GitHub Actions 部署

仓库工作流会先运行测试，再进行部署。必需的部署输入为 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`D1_DATABASE_ID`、`KV_NAMESPACE_ID`、`DOMAIN`（JSON 数组）、`ADMIN` 和 `JWT_SECRET`。仅初始化新数据库时需要 `BOOTSTRAP_TOKEN`。`CUSTOM_DOMAIN`、`R2_BUCKET_NAME`、`AI_MODEL`、`ANALYSIS_CACHE`、`PROJECT_LINK` 和 VAPID 值均为可选项。Fork 后请启用 GitHub Actions，否则推送不会产生部署任务。

## 配置参考

### Bindings 与非敏感变量

| 名称 | 是否必需 | 用途 |
| --- | --- | --- |
| `db` | 是 | D1 应用数据 binding |
| `kv` | 是 | 会话状态、缓存和对象存储回退的 KV binding |
| `assets` | 是 | 提供 `./dist` 的 Worker Static Assets binding |
| `domain` | 是 | 可管理邮件域名数组 |
| `admin` | 是 | 管理员邮箱地址 |
| `TURNSTILE_HOSTNAME` | 建议 | Turnstile/CORS 允许的主机名 |
| `r2` | 可选 | R2 附件/对象存储 binding |
| `email` | 可选 | Cloudflare Email Sending binding |
| `ai` / `ai_model` | 可选 | Workers AI 验证码提取 |
| `analysis_cache` | 可选 | 分析缓存开关 |
| `CORS_ORIGIN`、`CORS_ORIGINS` | 可选 | 附加 API CORS origins |
| `project_link` | 可选 | 设置中展示的项目链接 |

### Secrets

| Secret | 是否必需 | 用途 |
| --- | --- | --- |
| `jwt_secret` | 是 | 签发认证 token |
| `BOOTSTRAP_TOKEN` | 仅新数据库 | 单次数据库初始化授权 |
| `TURNSTILE_SECRET_KEY` | 启用 Turnstile 时 | 服务端 Turnstile 验证 |
| `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` | GitHub OAuth | GitHub OAuth 客户端凭据 |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | Google OAuth binding 配置 | Google OAuth 客户端凭据 |
| `resend_webhook_secret` | Resend webhook | 验证 Resend webhook 签名 |
| `vapid_public_key`、`vapid_private_key`、`vapid_subject` | Web Push | VAPID 订阅和投递密钥 |

Worker 没有 `RESEND_API_KEY` 环境 binding：Resend token 是管理员按域名保存的设置。Telegram 和 S3 兼容存储凭据也由受保护的系统设置管理，因此未复制到上表。

## 安全说明

Nova Mail 当前具备以下保护措施。它们降低特定风险，但仍需要正确配置，且不代表绝对安全保证。

- 已认证 API 请求需要有效 JWT、活跃的服务端会话和 KV 中的认证状态。会话以哈希形式保存，可按设备撤销。
- 管理 API 前缀要求管理员会话；敏感操作还会检查角色权限。委派角色不能超出操作者的权限、域名范围或相关配额。
- 读取或修改邮件、附件前会验证其所有者。附件仅通过认证路由提供；直接访问 `/attachments/` 会得到 404。
- HTML 邮件会先净化，再放进 sandboxed iframe 渲染。链接/图片处理受约束，邮件和附件输入会进行大小、数量、MIME 与文件名校验。
- OAuth 事务使用会过期的一次性 state、`__Host-` HttpOnly/Secure/SameSite cookies、PKCE、nonce 校验和短期、浏览器绑定的完成授权。
- 注册码兑换是原子操作；登录与注册具有限流。bootstrap 端点使用常量时间 token 比对，且不能初始化已有应用。
- Resend webhook 会进行签名验证。出站 webhook URL 仅允许 HTTPS，会拒绝不安全的字面 IP 范围，也不会跟随重定向。
- API 响应设置浏览器安全 headers；启用 Turnstile 时会验证预期主机名。

请保持对象存储私有。不要通过 R2 公共域名、S3 bucket policy 或 CDN 规则暴露附件前缀。

## 本地开发

在仓库根目录执行：

```bash
pnpm install
pnpm dev
```

可用的根目录 scripts：

```bash
pnpm build
pnpm test
pnpm test:frontend
pnpm test:worker
pnpm test:worker:unit
pnpm test:worker:integration
```

`pnpm dev` 会启动两个 workspace 的 Vite 和 `wrangler dev`。Worker 开发命令使用 `mail-worker/wrangler-dev.toml`；在测试认证流程前，请先设置其中的 D1/KV ID 和 Worker secrets。Worker integration tests 使用 `wrangler.vitest.toml` 中隔离的 binding，不需要 Cloudflare 凭据。

## 项目结构

```text
nova-mail/
├── mail-vue/                 # Vue SPA、PWA assets、UI tests
│   ├── src/views/            # 邮件、设置、登录和管理页面
│   ├── src/components/       # 邮件列表、HTML frame、编辑器、头像、快捷键
│   └── public/               # PWA 图标、push handler、静态编辑器资源
├── mail-worker/              # Cloudflare Worker
│   ├── src/api/              # HTTP endpoints
│   ├── src/email/            # Cloudflare Email Routing handler
│   ├── src/service/          # 邮件、认证、存储、OAuth 和集成
│   ├── src/security/         # 会话与授权中间件
│   ├── migrations/           # 已有 D1 数据库的独立升级脚本
│   └── wrangler*.toml        # 生产、开发、测试和 CI 配置
├── doc/demo/                 # README 截图
├── .github/workflows/        # 测试与部署工作流
└── README.md
```

## 贡献

Fork 仓库后创建聚焦的分支，完成并测试修改，再提交 Pull Request，说明行为变化与验证结果。请勿提交凭据、生成的本地状态或生产配置值。

## 许可证

Nova Mail 使用 [MIT License](LICENSE)。许可证保留了原始项目和 Nova Mail 修改的版权声明。

## 作者

Beihaime — <https://github.com/beihaime>
