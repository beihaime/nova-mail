<p align="center">
  <img src="https://raw.githubusercontent.com/beihaime/nova-mail/main/mail-vue/src/icons/svg/brand-app-dark.svg" width="80" alt="Nova Mail" />
  <h1 align="center">Nova Mail</h1>
  <p align="center">基于 Cloudflare 的简约响应式自托管邮箱服务</p>
  <p align="center">
    简体中文 | <a href="README.md">English</a>
  </p>
  <p align="center">
    <a href="https://mail.beihaime.com" target="_blank">在线演示</a> ·
    <a href="#部署">部署指南</a> ·
    <a href="#功能特性">功能</a>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/platform-Cloudflare%20Workers-orange" alt="Platform" />
  <img src="https://img.shields.io/badge/frontend-Vue3-brightgreen" alt="Vue3" />
  <img src="https://img.shields.io/badge/backend-Hono-blue" alt="Hono" />
</p>

---

## 项目简介

Nova Mail 是一个可部署在 **Cloudflare Workers** 上的自托管邮箱服务。  
只需一个域名，即可创建多个邮箱地址，支持收发邮件、附件、管理后台与权限控制。

本项目基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 进行二次开发与品牌重塑，重点优化了界面体验、登录安全与身份认证。

**在线演示**：[https://mail.beihaime.com](https://mail.beihaime.com)

---

## 功能特性

### 核心能力

- **低成本部署**：完全运行在 Cloudflare Workers + D1 + R2 + KV，几乎无需额外服务器费用
- **邮件收发**：支持接收与发送邮件，集成 Resend，支持群发、内嵌图片与附件
- **附件支持**：使用 Cloudflare R2 存储与下载附件
- **多邮箱模式**：一个用户可绑定多个邮箱地址
- **响应式设计**：自动适配桌面与移动端浏览器，支持 PWA

### 管理与安全

- **管理员后台**：用户管理、邮件管理、RBAC 权限控制与资源限制
- **人机验证**：集成 Cloudflare Turnstile，防止批量注册与暴力登录
- **GitHub 登录**：支持 GitHub OAuth 登录与账号关联
- **安全加固**：JWT 密钥、Turnstile 服务端验证、登录保护等

### 扩展能力

- **邮件推送**：接收邮件后可转发到 Telegram 机器人或其他邮箱
- **开放 API**：支持批量创建用户、多条件查询邮件
- **验证码识别**：使用 Workers AI 自动识别邮件中的验证码
- **数据可视化**：基于 ECharts 展示系统数据与邮件增长趋势
- **个性化设置**：自定义网站标题、登录背景、透明度等
- **国际化**：支持多语言切换

---

## 技术栈

| 层级       | 技术                    |
|------------|-------------------------|
| 平台       | Cloudflare Workers      |
| 后端框架   | Hono                    |
| ORM        | Drizzle                 |
| 前端框架   | Vue 3 + Vite            |
| UI 组件库  | Element Plus            |
| 状态管理   | Pinia                   |
| 邮件发送   | Resend                  |
| 数据库     | Cloudflare D1           |
| 对象存储   | Cloudflare R2           |
| 缓存       | Cloudflare KV           |
| AI         | Cloudflare Workers AI   |
| 人机验证   | Cloudflare Turnstile    |

---

## 目录结构

```text
nova-mail
├── mail-worker/                 # Cloudflare Workers 后端
│   ├── src/
│   │   ├── api/                 # API 接口层
│   │   ├── dao/                 # 数据访问层
│   │   ├── email/               # 邮件接收与处理
│   │   ├── entity/              # 数据库实体
│   │   ├── security/            # 身份认证与权限
│   │   ├── service/             # 业务逻辑
│   │   ├── hono/                # 中间件与异常处理
│   │   └── index.js             # 入口
│   ├── wrangler.toml            # Workers 配置
│   └── package.json
│
├── mail-vue/                    # Vue 3 前端
│   ├── src/
│   │   ├── components/          # 公共组件
│   │   ├── views/               # 页面
│   │   ├── layout/              # 布局
│   │   ├── store/               # Pinia 状态
│   │   ├── router/              # 路由
│   │   ├── request/             # API 请求
│   │   └── icons/               # 图标系统
│   ├── package.json
│   └── vite.config.js
│
├── doc/                         # 文档与演示资源
├── cn.md                        # 中文 README
├── en.md                        # English README
└── README.md
```

---

## 快速开始

### 环境要求

- Node.js 18+
- pnpm
- Cloudflare 账号（Workers、D1、KV、R2、可选 AI）

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/beihaime/nova-mail.git
cd nova-mail

# 安装后端依赖
cd mail-worker
pnpm install

# 安装前端依赖
cd ../mail-vue
pnpm install

# 启动前端开发服务器
pnpm dev

# 启动 Workers 开发环境（另开终端）
cd ../mail-worker
pnpm dev
```

### 部署到 Cloudflare

1. 在 Cloudflare 创建 D1 数据库、KV 命名空间、R2 存储桶（如需附件）
2. 修改 `mail-worker/wrangler.toml` 中的绑定配置
3. 设置必要密钥：

```bash
cd mail-worker
pnpm wrangler secret put jwt_secret
pnpm wrangler secret put TURNSTILE_SECRET_KEY
# 如使用 Resend
pnpm wrangler secret put RESEND_API_KEY
```

4. 部署：

```bash
pnpm deploy
```

前端静态资源会通过 `wrangler.toml` 中的 `[assets]` 配置随 Workers 一起发布。

更详细的部署说明可参考原项目文档，并结合本仓库的 `wrangler.toml` 进行调整。

---

## 配置说明（关键项）

在 `wrangler.toml` 的 `[vars]` 中可配置：

| 变量                 | 说明                                              |
|----------------------|---------------------------------------------------|
| `domain`             | 支持的邮件域名列表，如 `["example.com"]`          |
| `admin`              | 管理员邮箱                                        |
| `TURNSTILE_HOSTNAME` | Turnstile 验证的主机名（当前为 `mail.beihaime.com`） |
| `ai_model`           | Workers AI 模型（可选）                           |

JWT 与 Turnstile 密钥请通过 `wrangler secret` 设置，不要写入配置文件。

---

## 与原项目的主要差异

相比 [cloud-mail](https://github.com/maillab/cloud-mail)，Nova Mail 主要做了以下改进：

- 完整品牌重塑（Nova Mail）
- 现代化 UI 重设计与图标系统
- 支持 GitHub OAuth 登录与账号关联
- 强化 Turnstile 登录保护与稳定性
- 安全相关加固
- 可调整邮件布局等体验优化
- PWA 品牌与加载体验优化

---

## 许可证

本项目基于 MIT 许可证开源。

原项目版权归 [aslost / maillab](https://github.com/maillab/cloud-mail) 所有，本仓库在其基础上进行修改与扩展。

---

## 致谢

- [maillab/cloud-mail](https://github.com/maillab/cloud-mail) — 原始项目
- Cloudflare Workers / D1 / R2 / KV / Turnstile / Workers AI
- Hono、Vue 3、Element Plus、Drizzle、Resend 等开源项目

---

## 交流与反馈

如有问题或建议，欢迎通过 GitHub Issues 反馈。
