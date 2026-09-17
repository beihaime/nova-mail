<div align="center">
  <img
    src="https://raw.githubusercontent.com/beihaime/nova-mail/main/mail-vue/src/icons/svg/brand-app-dark.svg"
    alt="Nova Mail"
    width="96"
  />

  <h1>Nova Mail</h1>

  <p>
    <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
  </p>
  
[![MIT License](https://img.shields.io/github/license/beihaime/nova-mail?style=flat)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/beihaime/nova-mail?style=flat)](https://github.com/beihaime/nova-mail/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/beihaime/nova-mail?style=flat)](https://github.com/beihaime/nova-mail/network/members)
[![GitHub issues](https://img.shields.io/github/issues/beihaime/nova-mail?style=flat)](https://github.com/beihaime/nova-mail/issues)
[![Last commit](https://img.shields.io/github/last-commit/beihaime/nova-mail?style=flat)](https://github.com/beihaime/nova-mail/commits/main/)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?style=flat&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![pnpm](https://img.shields.io/badge/package%20manager-pnpm-f69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)

</div>

Nova Mail is a modern web mail client based on the open-source [cloud-mail](https://github.com/maillab/cloud-mail) project. It keeps the original Cloudflare-based mail workflow while providing a cleaner interface, multi-address account management, and integrated OAuth authentication.

## Preview

### Login

![Nova Mail Login](doc/demo/loginDemo.png)

### Mail interface

![Nova Mail Mail View](doc/demo/webview.png)

## Features

- Responsive desktop and mobile mail interface
- Light and dark themes with Nova Mail branding and PWA support
- Inbox, sent mail, drafts, starred mail, archive, spam, trash, folders, and search
- Multiple email addresses per Nova Mail account with address switching and a dedicated address-management page
- Compose, reply, forward, mark read/unread, star, delete, archive, attachments, and email printing
- Sanitized rich HTML email rendering and plain-text email support
- GitHub OAuth login and account linking
- Google OAuth/OIDC login and account linking
- Cloudflare Turnstile verification for protected account operations
- Admin user and mailbox management with roles and permissions
- Cloudflare Email Workers receiving, Resend sending/status webhooks, and R2 attachment storage
- Optional Telegram forwarding, webhook forwarding, verification-code extraction with Workers AI, and analytics
- English and Simplified Chinese localization

## Tech stack

### Frontend

- Vue 3 and Vite
- Vue Router and Pinia
- Element Plus
- Iconify and the Nova Mail SVG icon assets
- DOMPurify for email HTML sanitization
- `vite-plugin-pwa`

### Backend and infrastructure

- Cloudflare Workers with Hono
- Cloudflare D1 for application data
- Cloudflare KV for sessions, temporary OAuth grants, and cached settings
- Cloudflare R2 for attachments and stored objects
- Cloudflare Email Workers for inbound email handling
- Resend for outbound email and delivery webhooks
- Cloudflare Turnstile for bot verification
- Cloudflare Workers AI for optional verification-code extraction
- Drizzle ORM and Postal MIME

## Project structure

```text
nova-mail/
├── mail-vue/                  # Vue frontend
│   ├── src/components/        # Shared UI components
│   ├── src/layout/            # Application shell and header/sidebar
│   ├── src/router/            # Vue Router routes
│   ├── src/store/             # Pinia stores
│   ├── src/views/             # Mail, settings, login, preview, and admin views
│   ├── src/icons/             # Nova Mail SVG icon system
│   ├── public/                # Static assets and PWA icons
│   ├── package.json
│   └── vite.config.js
├── mail-worker/               # Cloudflare Worker backend
│   ├── src/api/               # HTTP API routes
│   ├── src/service/           # Authentication, mail, OAuth, storage, and settings logic
│   ├── src/entity/            # D1/Drizzle entities
│   ├── src/email/             # Cloudflare Email Worker handler
│   ├── src/security/          # Authentication and permission middleware
│   ├── src/hono/              # Hono application setup
│   ├── src/index.js           # Worker entry point
│   ├── wrangler.toml          # Production Worker configuration
│   ├── wrangler-dev.toml      # Local development configuration
│   └── package.json
├── doc/demo/                  # README screenshots
├── LICENSE
└── README.md
```

## Development

### Requirements

- Node.js 18 or newer
- pnpm
- A Cloudflare account for Worker/D1/KV development

The repository contains separate frontend and Worker packages. Install dependencies in each package:

```bash
git clone https://github.com/beihaime/nova-mail.git
cd nova-mail

pnpm --dir mail-vue install
pnpm --dir mail-worker install
```

Start the frontend development server:

```bash
pnpm --dir mail-vue dev
```

Start the Worker development environment in a second terminal:

```bash
pnpm --dir mail-worker dev
```

The frontend package also provides:

```bash
pnpm --dir mail-vue build    # production frontend build
pnpm --dir mail-vue preview  # preview the built frontend
```

The Worker package provides `dev`, `start`, `deploy`, and `test` scripts. The `test` script is the repository's Wrangler deployment configuration for the test environment; review `wrangler-test.toml` before using it.

## Configuration

Cloudflare bindings and non-secret variables are defined in `mail-worker/wrangler.toml` and its environment-specific variants. Common settings include:

- `domain`: allowed mail domains
- `admin`: administrator email address
- `TURNSTILE_HOSTNAME`: hostname expected by Turnstile verification
- `ai_model`: optional Workers AI model

Configure secrets with Wrangler. Never commit their values:

```bash
cd mail-worker
pnpm wrangler secret put jwt_secret
pnpm wrangler secret put TURNSTILE_SECRET_KEY
pnpm wrangler secret put GITHUB_CLIENT_SECRET
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put resend_webhook_secret
```

The corresponding public/provider configuration is managed through the existing settings flow and `GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID` may be supplied as Worker environment variables where applicable. OAuth client secrets are server-side only.

### OAuth callback URLs

The Worker callback paths are:

```text
https://<your-domain>/api/oauth/github/callback
https://<your-domain>/api/oauth/google/callback
```

Register the exact deployed URLs in the GitHub and Google provider consoles. For the current deployment, the Google callback is:

```text
https://mail.beihaime.com/api/oauth/google/callback
```

Google login requests only the OpenID Connect identity scopes (`openid`, `email`, and `profile`). Nova Mail does not place provider access tokens in the browser or in the repository.

## Deployment

The production configuration uses a Cloudflare Worker with Static Assets. The frontend build output is written to the Worker asset directory configured in `mail-worker/wrangler.toml`.

Build and deploy from the Worker directory:

```bash
cd mail-worker
pnpm deploy
```

Before deployment, review the selected Wrangler configuration, D1 and KV bindings, Static Assets directory, custom domain, and required secrets. Database initialization and versioned schema setup are handled by the existing Worker initialization routes; do not recreate or reset a production D1 database.

Inbound mail is handled by the Worker Email handler, while outbound delivery and delivery-status events use the configured Resend integration. Attachments are authorized against the owning user before R2 objects are served.

## Upstream & credits

Nova Mail is based on [maillab/cloud-mail](https://github.com/maillab/cloud-mail). The upstream project and its original authors remain credited under the original license. Nova Mail adds its own branding and frontend, authentication, and security-related changes on top of that codebase.

## License

This project is licensed under the MIT License.

See [LICENSE](LICENSE) for details. The repository retains the original copyright notice and the Nova Mail modification copyright notice.
