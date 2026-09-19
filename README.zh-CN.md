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
    一个基于 Cloudflare 构建的现代化 Web 邮件客户端。
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
</div>


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

手工部署前请检查所选 Wrangler 配置、D1 和 KV bindings、Static Assets 目录、自定义域名以及所需 secrets。

### GitHub Actions 流水线

`.github/workflows/deploy-cloudflare.yml` 在推送到 `main` 且改动涉及 `mail-worker/**` 或 `mail-vue/**` 时触发，也可以手动启动（`workflow_dispatch`，或 `gh workflow run deploy-cloudflare.yml`）。它会依次安装依赖、用仓库 secrets 渲染 `wrangler-action.toml`、构建前端、部署 Worker、调用初始化接口，最后回读数据库 schema 以证明迁移确实生效。

**fork 默认不会运行任何工作流。** GitHub 会禁用 fork 仓库的 Actions，所以第一步是打开仓库的 **Actions** 标签页，点击 *"I understand my workflows, go ahead and enable them"*。在这之前，每次 push 看起来都成功，但实际上什么都没部署，连运行记录都不会产生。

#### 仓库 secrets

所有值都按 `secrets.NAME || vars.NAME` 读取，因此放在 **Variables** 里也能生效 —— 但凭据请放 **Secrets**，因为 Variables 的值会原样打印进运行日志。所有值都必须是**单行**：流水线用 `sed` 把它们替换进 TOML 文件，折行粘贴会让这一步直接失败。

| Secret | 必需 | 取值 | 缺失或填错的后果 |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | API token，权限见下 | 运行在「设置环境」步骤失败 |
| `CLOUDFLARE_ACCOUNT_ID` | 是 | Cloudflare 帐户 ID | 运行在「设置环境」步骤失败 |
| `JWT_SECRET` | 是 | 随机值，32 位以上，不能含 `?` `%` `#` `/` `\` `\|` `&` | 用于签发登录令牌；更换后所有会话失效 |
| `ADMIN` | 是 | 管理员**邮箱**，且与真实存在的账号一致 | 该账号会被当作普通用户，没有任何管理权限 |
| `DOMAIN` | 是 | JSON 数组，如 `["example.com"]` | 填裸域名 `example.com` 会通不过 `jq` 校验并中断运行 |
| `D1_DATABASE_ID` | 是¹ | `pnpm wrangler d1 list`，或 `wrangler.toml` | 不填则流水线会去找名为 `$NAME` 的库，**找不到就新建一个空库** |
| `KV_NAMESPACE_ID` | 是¹ | `pnpm wrangler kv namespace list` | 不填则会新建一个名为 `$NAME` 的 KV 命名空间，缓存计数丢失 |
| `CUSTOM_DOMAIN` | 否 | 如 `mail.example.com` | 会删掉 `routes` 配置，且初始化接口退回 `workers.dev` 域名 |
| `NAME` | 否 | 默认 `nova-mail` | 必须与已部署的 Worker 名称一致 |
| `AI_MODEL`、`ANALYSIS_CACHE`、`R2_BUCKET_NAME`、`PROJECT_LINK`、`CF_EMAIL` | 否 | 见 `wrangler-action.toml` | 未设置时会移除 R2 binding 和 `project_link` |

¹ 工作流里是可选的，但不填会把部署指向**新建的空资源**，而不是你已有的库和命名空间。

#### API token 权限

| 资源 | 权限 | 用途 |
| --- | --- | --- |
| 帐户 | Workers 脚本 · 编辑 | 部署 Worker |
| 帐户 | Workers KV 存储 · 编辑 | KV binding |
| 帐户 | D1 · 编辑 | schema 校验步骤；缺少时该步骤只发 warning |
| 区域 | Workers 路由 · 编辑 | `custom_domain` 路由 |
| 区域 | 区域 · 读取 | 解析该路由 |

官方 "Edit Cloudflare Workers" 模板已包含两条区域权限和除 D1 之外的帐户权限 —— D1 需要手动添加。

#### 数据库初始化

schema 变更版本化在 `mail-worker/src/init/init.js`，由 Worker 自身的路由执行：

```bash
curl -sL https://<your-domain>/api/init/<jwt_secret>   # 返回：success
```

流水线在每次部署后都会调用它。有两点需要知道：

- 每个迁移语句都包在 `try/catch` 里，所以 **返回 `success` 并不代表迁移生效** —— `ALTER TABLE` 失败只会记一条日志。因此流水线会回读 schema，发现缺列就判定失败。同样的检查也可以在 D1 控制台手工执行：`SELECT name FROM pragma_table_info('email');`
- 该路由是幂等的，对已是最新结构的库重复执行不会有任何变化。绝不要重建或重置生产 D1 数据库。

个别迁移也单独保留在 `mail-worker/migrations/` 下，便于手上没有 `jwt_secret` 时使用：

```bash
cd mail-worker
pnpm wrangler d1 execute <database-id> --remote --file migrations/v3_8_body_type.sql
```

#### 常见故障

| 现象 | 原因 |
| --- | --- |
| push 成功但什么都没部署，`gh run list` 没有任何记录 | fork 的 Actions 从未启用 |
| `jq: parse error: Invalid numeric literal` / 提示 DOMAIN 必须是 JSON 数组 | `DOMAIN` 不是 JSON 数组 |
| `sed: unterminated 's' command` | 某个被替换的 secret 里含换行（折行粘贴） |
| `Invalid TOML document ... admin = "..."` | `ADMIN` 里不是纯邮箱 |
| `d1 execute` 报 `Couldn't find DB with name ...` | API token 没有 D1 权限，或帐户 ID 填错 |
| 部署成功但邮件列表为空 | Worker 被绑定到了另一个新建的 D1 数据库 |

Inbound mail 由 Worker Email handler 处理；Outbound delivery 和投递状态事件使用已配置的 Resend 集成。附件在提供 R2 对象前会校验所属用户的授权。

## 上游项目与致谢

Nova Mail 基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 开发。原项目及其作者根据原许可证继续获得 attribution。Nova Mail 在其基础上增加了自己的 branding、frontend/UI、认证和安全相关改进。

## 许可证

本项目使用 MIT License。

详见 [LICENSE](LICENSE)。仓库保留原始版权声明以及 Nova Mail 的修改版权声明。
