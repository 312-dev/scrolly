<p align="center">
  <img src="static/icons/icon-192.png" alt="Scrolly" width="100" />
</p>

<h1 align="center">Scrolly</h1>

<p align="center">
  Private video-sharing PWA for friend groups.
</p>

<p align="center">
  <a href="https://github.com/312-dev/scrolly/actions/workflows/ci.yml"><img src="https://github.com/312-dev/scrolly/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/312-dev/scrolly/actions/workflows/security.yml"><img src="https://github.com/312-dev/scrolly/actions/workflows/security.yml/badge.svg" alt="Security"></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/312-dev/scrolly"><img src="https://api.scorecard.dev/projects/github.com/312-dev/scrolly/badge" alt="OpenSSF Scorecard"></a>
  <a href="https://snyk.io/test/github/312-dev/scrolly"><img src="https://snyk.io/test/github/312-dev/scrolly/badge.svg" alt="Known Vulnerabilities"></a>
  <a href="https://github.com/312-dev/scrolly/releases/latest"><img src="https://img.shields.io/github/v/release/312-dev/scrolly?label=release" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/312-dev/scrolly" alt="License"></a>
</p>

---

Share video clips and music links with your close friends. TikTok-style vertical feed, invite-only group, installable PWA.

## Features

- Full-screen vertical reel with swipe navigation and playback speed control
- Share videos and music via paste, Android share sheet, or iOS Shortcuts
- Cross-platform music link resolution (Spotify, Apple Music, YouTube Music)
- Threaded comments, emoji reactions, GIF search, and view tracking
- Push notifications and in-app activity feed
- Host controls: members, retention, storage limits, platform filtering, download providers
- Dark/light/system themes, profile avatars, favorites
- Phone verification via Twilio, pluggable video download providers

> **Note:** Scrolly does not bundle any download tools. The host must explicitly install a provider from Settings. See [DISCLAIMER.md](DISCLAIMER.md).

## Quick Start

**Prerequisites:** Node.js 24+

```bash
git clone https://github.com/312-dev/scrolly.git
cd scrolly
npm install
cp .env.example .env   # edit with your values
npm run dev
```

## Docker

```bash
curl -LO https://raw.githubusercontent.com/312-dev/scrolly/main/docker-compose.yml
curl -LO https://raw.githubusercontent.com/312-dev/scrolly/main/.env.example
cp .env.example .env && nano .env
docker compose up -d
```

Migrations run automatically on startup. Upgrade with `docker compose pull && docker compose up -d`.

## Docs

**[312-dev.github.io/scrolly](https://312-dev.github.io/scrolly/)** — deployment, configuration, and API reference.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run type-check` | TypeScript check |
| `npm run test` | Unit tests |
| `npm run test:coverage` | Tests with coverage |

## Links

- [Contributing](CONTRIBUTING.md) — development setup and PR guidelines
- [Security](SECURITY.md) — vulnerability reporting
- [Disclaimer](DISCLAIMER.md) — content and liability
- [License](LICENSE) — MIT
