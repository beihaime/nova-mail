<p align="center">
  <img src="mail-vue/src/icons/svg/brand-app-dark.svg" width="80" alt="Nova Mail" />
  <h1 align="center">Nova Mail</h1>
  <p align="center">A simple, responsive self-hosted email service on Cloudflare</p>
  <p align="center">
    <a href="doc/README.CN.md">简体中文</a> | English
  </p>
  <p align="center">
    <a href="https://mail.beihaime.com" target="_blank">Live Demo</a> ·
    <a href="#deployment">Deployment</a> ·
    <a href="#features">Features</a>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/platform-Cloudflare%20Workers-orange" alt="Platform" />
  <img src="https://img.shields.io/badge/frontend-Vue3-brightgreen" alt="Vue3" />
  <img src="https://img.shields.io/badge/backend-Hono-blue" alt="Hono" />
</p>

---

## Introduction

Nova Mail is a self-hosted email service designed to run on **Cloudflare Workers**.  
With just one domain, you can create multiple email addresses, send and receive messages, handle attachments, and manage users through an admin panel with permission control.

This project is a fork and rebrand of [maillab/cloud-mail](https://github.com/maillab/cloud-mail), with a focus on improved UI experience, login security, and authentication.

**Live Demo**: [https://mail.beihaime.com](https://mail.beihaime.com)

---

## Features

### Core

- **Low-cost deployment**: Runs entirely on Cloudflare Workers + D1 + R2 + KV — almost no extra server cost
- **Send & receive email**: Integrated with Resend for sending (bulk, inline images, attachments); receive via Cloudflare Email Routing
- **Attachments**: Store and download files with Cloudflare R2
- **Multi-mailbox mode**: One user can bind multiple email addresses
- **Responsive design**: Works on desktop and most mobile browsers; PWA supported

### Admin & Security

- **Admin panel**: User management, email management, RBAC permission control and resource limits
- **CAPTCHA**: Cloudflare Turnstile to prevent bulk registration and brute-force login
- **GitHub login**: GitHub OAuth login and account linking
- **Security hardening**: JWT secrets, server-side Turnstile verification, login protection, etc.

### Extensions

- **Email push**: Forward received emails to a Telegram bot or other email providers
- **Open API**: Batch create users and query emails with multiple conditions
- **Verification code recognition**: Auto-detect codes in emails via Workers AI
- **Data visualization**: System stats and email growth charts with ECharts
- **Personalization**: Custom site title, login background, transparency, etc.
- **i18n**: Multi-language support

---

## Tech Stack

| Layer          | Technology              |
|----------------|-------------------------|
| Platform       | Cloudflare Workers      |
| Backend        | Hono                    |
| ORM            | Drizzle                 |
| Frontend       | Vue 3 + Vite            |
| UI Library     | Element Plus            |
| State          | Pinia                   |
| Email Sending  | Resend                  |
| Database       | Cloudflare D1           |
| Object Storage | Cloudflare R2           |
| Cache          | Cloudflare KV           |
| AI             | Cloudflare Workers AI   |
| CAPTCHA        | Cloudflare Turnstile    |

---

## Project Structure

```text
nova-mail
├── mail-worker/                 # Cloudflare Workers backend
│   ├── src/
│   │   ├── api/                 # API layer
│   │   ├── dao/                 # Data access layer
│   │   ├── email/               # Email receive & processing
│   │   ├── entity/              # Database entities
│   │   ├── security/            # Auth & permissions
│   │   ├── service/             # Business logic
│   │   ├── hono/                # Middleware & error handling
│   │   └── index.js             # Entry point
│   ├── wrangler.toml            # Workers config
│   └── package.json
│
├── mail-vue/                    # Vue 3 frontend
│   ├── src/
│   │   ├── components/          # Shared components
│   │   ├── views/               # Pages
│   │   ├── layout/              # Layout
│   │   ├── store/               # Pinia stores
│   │   ├── router/              # Router
│   │   ├── request/             # API requests
│   │   └── icons/               # Icon system
│   ├── package.json
│   └── vite.config.js
│
├── doc/                         # Docs & demo assets
├── cn.md                        # Chinese README
├── en.md                        # English README
└── README.md
```

---

## Getting Started

### Requirements

- Node.js 18+
- pnpm
- Cloudflare account (Workers, D1, KV, R2, optional AI)

### Local Development

```bash
# Clone the repository
git clone https://github.com/beihaime/nova-mail.git
cd nova-mail

# Install backend dependencies
cd mail-worker
pnpm install

# Install frontend dependencies
cd ../mail-vue
pnpm install

# Start frontend dev server
pnpm dev

# Start Workers dev environment (separate terminal)
cd ../mail-worker
pnpm dev
```

### Deploy to Cloudflare

1. Create a D1 database, KV namespace, and R2 bucket (if you need attachments) in Cloudflare
2. Update bindings in `mail-worker/wrangler.toml`
3. Set required secrets:

```bash
cd mail-worker
pnpm wrangler secret put jwt_secret
pnpm wrangler secret put BOOTSTRAP_TOKEN
pnpm wrangler secret put TURNSTILE_SECRET_KEY
# If using Resend
pnpm wrangler secret put RESEND_API_KEY
```

4. Deploy:

```bash
pnpm deploy
```

Frontend static assets are published together with the Worker via the `[assets]` config in `wrangler.toml`.

For a new database only, initialize the schema once after deployment. `BOOTSTRAP_TOKEN` must be a separately generated random secret; it is never the JWT signing secret and is sent in a request header rather than a URL:

```bash
curl --fail-with-body -X POST https://your-worker.example/api/bootstrap \
  -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN"
```

The bootstrap token is consumed atomically and cannot be used again. After a successful initialization, remove `BOOTSTRAP_TOKEN` from the deployed Worker (or rotate it immediately); it is needed only for a genuinely new D1 installation.

### Webhook outbound security

Webhook destinations must use HTTPS. Nova Mail rejects local, private, link-local, reserved, metadata, and other unsafe literal IP destinations, and it never follows webhook redirects. Cloudflare Workers' standard `fetch` API does not expose DNS answers or let this Worker pin a checked DNS address to the later outbound connection. Therefore, an arbitrary public hostname can still be a DNS-rebinding/private-DNS risk where the deployment permits access to private networks. For that deployment model, configure an administrator-managed hostname allowlist or route webhooks through a controlled outbound proxy/Cloudflare egress policy; do not treat the in-Worker URL filter as DNS-rebinding protection.

For more detailed deployment steps, refer to the upstream project docs and adjust according to this repository’s `wrangler.toml`.

---

## Configuration (Optional)

You can set the following in the `[vars]` section of `wrangler.toml`:

| Variable             | Description                                              |
|----------------------|----------------------------------------------------------|
| `domain`             | Allowed email domains, e.g. `["example.com"]`            |
| `admin`              | Admin email address                                      |
| `TURNSTILE_HOSTNAME` | Hostname for Turnstile verification (`mail.beihaime.com`) |
| `ai_model`           | Workers AI model (optional)                              |

JWT and Turnstile secrets must be set with `wrangler secret` — do not put them in the config file.

---

## Differences from Upstream

Compared to [cloud-mail](https://github.com/maillab/cloud-mail), Nova Mail includes:

- Full rebranding (Nova Mail)
- Modern UI redesign and icon system
- GitHub OAuth login and account linking
- Stronger Turnstile login protection and stability
- Security hardening
- Resizable mail layout and other UX improvements
- PWA branding and loading experience improvements

---

## License

This project is licensed under the MIT License.

Original copyright belongs to [aslost / maillab](https://github.com/maillab/cloud-mail). This repository is a modified and extended version.

---

## Acknowledgements

- [maillab/cloud-mail](https://github.com/maillab/cloud-mail) — original project
- Cloudflare Workers / D1 / R2 / KV / Turnstile / Workers AI
- Hono, Vue 3, Element Plus, Drizzle, Resend, and other open-source projects

---

## Feedback

Questions or suggestions? Please open a GitHub Issue.
