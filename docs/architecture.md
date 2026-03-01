# Architecture

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | SvelteKit (PWA) | Compiled to vanilla JS, small bundle, built-in service worker support |
| Backend | SvelteKit adapter-node | Monolithic — API routes + frontend in one Node.js process |
| Database | SQLite via Drizzle ORM | Single file, no separate server, type-safe queries |
| Video downloads | Pluggable providers (subprocess) | Host-installed at runtime; supports TikTok, Instagram, YouTube, Facebook, and more |
| Music resolution | Odesli | Cross-platform streaming link resolution (Spotify, Apple Music, YouTube Music) |
| Video storage | Local filesystem | `data/videos/` on VPS |
| SMS | Twilio | SMS verification codes for phone-based auth |
| Push notifications | web-push (Node.js) | VAPID-based Web Push Protocol |
| Containerization | Docker | Single-container deployment with docker-compose |
| Language | TypeScript | End-to-end type safety |

## Overview

```
┌─────────────────────────────────────┐
│          Reverse Proxy (HTTPS)      │
├─────────────────────────────────────┤
│     SvelteKit (adapter-node)        │
│  ┌──────────┐  ┌─────────────────┐  │
│  │ Frontend  │  │  API Routes     │  │
│  │ (Svelte)  │  │  (+server.ts)   │  │
│  └──────────┘  └─────────────────┘  │
│         │              │            │
│    Service Worker   ┌──┴──┐        │
│    (PWA offline)    │     │        │
│                  SQLite  Filesystem │
│                  (Drizzle) (videos) │
├─────────────────────────────────────┤
│  Download provider (subprocess)     │
│  Twilio (SMS verification)          │
│  web-push (notifications)           │
│  Odesli (music link resolution)     │
└─────────────────────────────────────┘
```

## Why Monolithic SvelteKit

For 5-20 users, a single Node.js process handles everything. No microservices overhead, single deploy, simple ops. API routes live in `src/routes/api/` as `+server.ts` files alongside the frontend routes.

## Directory Structure

```
scrolly/
├── docs/                            # Planning & design docs
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts        # Drizzle schema definitions
│   │   │   │   ├── index.ts         # DB connection (better-sqlite3)
│   │   │   │   └── migrations/      # Drizzle migrations
│   │   │   ├── providers/
│   │   │   │   ├── types.ts         # Download provider interface
│   │   │   │   ├── registry.ts      # Known providers, runtime resolution
│   │   │   │   ├── binary.ts        # Binary download/install utilities
│   │   │   │   └── ytdlp/           # yt-dlp provider implementation
│   │   │   ├── video/
│   │   │   │   └── download.ts      # Video download orchestration + metadata
│   │   │   ├── music/
│   │   │   │   └── download.ts      # Odesli link resolution + audio download
│   │   │   ├── sms/
│   │   │   │   └── verify.ts        # Twilio SMS verification codes
│   │   │   ├── auth.ts              # Session management, invite code validation
│   │   │   ├── push.ts              # web-push wrapper, group notifications
│   │   │   ├── scheduler.ts         # Retention policy enforcement (periodic cleanup)
│   │   │   └── download-lock.ts     # Prevents duplicate concurrent downloads
│   │   ├── components/
│   │   │   ├── ReelItem.svelte      # Individual reel (video or music)
│   │   │   ├── ReelVideo.svelte     # Video player within a reel
│   │   │   ├── ReelMusic.svelte     # Music player within a reel
│   │   │   ├── ReelOverlay.svelte   # Bottom overlay (user info, caption)
│   │   │   ├── ActionSidebar.svelte # Right-side action buttons
│   │   │   ├── CommentsSheet.svelte # Bottom sheet for comments
│   │   │   ├── ViewersSheet.svelte  # Bottom sheet for view list
│   │   │   ├── AddVideoModal.svelte # Modal to paste/submit URLs
│   │   │   ├── ReactionPicker.svelte
│   │   │   ├── EmojiShower.svelte   # Animated emoji celebration
│   │   │   ├── ConfirmDialog.svelte
│   │   │   ├── ToastStack.svelte    # Toast notification stack
│   │   │   ├── InstallBanner.svelte # PWA install prompt
│   │   │   ├── SwUpdateToast.svelte # Service worker update prompt
│   │   │   ├── ViewBadge.svelte     # View count badge
│   │   │   ├── PlatformIcon.svelte  # Platform logo (TikTok, IG, etc.)
│   │   │   ├── ProgressBar.svelte
│   │   │   ├── InlineError.svelte
│   │   │   ├── FilterBar.svelte     # Feed filter tabs
│   │   │   ├── ShortcutGuideSheet.svelte # iOS Shortcut setup guide
│   │   │   └── settings/
│   │   │       ├── GroupNameEdit.svelte
│   │   │       ├── InviteLink.svelte
│   │   │       ├── MemberList.svelte
│   │   │       ├── RetentionPicker.svelte
│   │   │       ├── ClipsManager.svelte
│   │   │       ├── NotificationSettings.svelte # Push toggle + test button
│   │   │       ├── ShortcutManager.svelte   # iOS Shortcut config wrapper
│   │   │       ├── ShortcutSheet.svelte     # Shortcut setup sheet content
│   │   │       ├── ValidationResults.svelte # Shared validation display
│   │   │       ├── GettingStartedChecklist.svelte
│   │   │       └── SetupDoneState.svelte
│   │   ├── stores/
│   │   │   ├── notifications.ts     # Notification polling + unread count
│   │   │   ├── mute.ts              # Global mute state
│   │   │   ├── playbackSpeed.ts     # Video playback speed
│   │   │   ├── pwa.ts              # Install prompt, update detection
│   │   │   ├── toasts.ts           # Toast notification queue
│   │   │   ├── confirm.ts          # Confirmation dialog state
│   │   │   ├── addVideoModal.ts    # Add video modal state
│   │   │   ├── homeTap.ts          # Double-tap home to scroll to top
│   │   │   └── shortcutNudge.ts    # Share shortcut install nudge
│   │   ├── types.ts                 # Shared TypeScript types (Clip, etc.)
│   │   ├── push.ts                  # Client-side push subscription helpers
│   │   ├── feed.ts                  # Feed data loading
│   │   ├── gestures.ts             # Touch gesture utilities
│   │   ├── colors.ts               # Color utility functions
│   │   ├── utils.ts                # General utilities
│   │   └── url-validation.ts       # URL validation for clip submission
│   ├── routes/
│   │   ├── +layout.svelte          # App shell, nav, theme
│   │   ├── +page.svelte            # Landing / redirect
│   │   ├── join/+page.svelte       # Invite code entry
│   │   ├── onboard/+page.svelte    # Username + phone verification
│   │   ├── offline/+page.svelte    # Offline fallback page
│   │   ├── share/
│   │   │   ├── +page.svelte        # Share target handler (receives shared URLs)
│   │   │   └── setup/+page.svelte  # Share shortcut setup instructions
│   │   ├── api/                     # REST API (see docs/api.md)
│   │   │   ├── auth/
│   │   │   ├── clips/
│   │   │   ├── gifs/
│   │   │   ├── group/
│   │   │   ├── notifications/
│   │   │   ├── profile/
│   │   │   ├── push/
│   │   │   ├── videos/
│   │   │   ├── thumbnails/
│   │   │   └── health/
│   │   └── (app)/                   # Authenticated route group
│   │       ├── +page.svelte         # Feed (TikTok-style reel)
│   │       └── settings/+page.svelte # User + group settings
│   ├── service-worker.ts           # PWA caching, offline support
│   └── app.html
├── static/
│   ├── manifest.json               # PWA manifest
│   └── icons/                      # App icons
├── data/                           # Gitignored runtime data
│   ├── scrolly.db                  # SQLite database file
│   └── videos/                     # Downloaded video, audio, and thumbnail files
├── Dockerfile
├── docker-compose.yml
├── drizzle.config.ts
├── svelte.config.js
└── package.json
```

## Deployment

The recommended deployment method is Docker. See the README for docker-compose setup.

### Docker

```bash
docker compose up -d
```

The container includes Node.js and FFmpeg. Download providers are installed at runtime by the host from the Settings UI. Database migrations run automatically on startup. Data is persisted via a Docker volume.

### Manual Deployment

```
VPS (Ubuntu, e.g., DigitalOcean or Hetzner)
├── Node.js 24+   → runs SvelteKit build
├── FFmpeg         → for video/audio processing
├── Python 3       → required by some download providers
├── data/          → SQLite DB + video files + provider binaries
└── PM2            → process management, auto-restart
```

**Setup:**

1. Provision VPS (Ubuntu 22.04+), install Node.js 24+, FFmpeg, Python 3
2. Clone repo, `npm install`, `npm run build`
3. Create `data/videos/` directory
4. Configure environment variables (see `.env` template in repo)
5. Start app: `ORIGIN=https://your-domain.com pm2 start build/index.js --name scrolly`
6. Generate VAPID keys: `npx web-push generate-vapid-keys`
7. Configure Twilio for SMS verification codes (see deployment docs)
8. Set up a reverse proxy (Caddy, nginx, etc.) for HTTPS

### ORIGIN and CSRF Protection

SvelteKit has built-in CSRF protection that checks the `Origin` header on form submissions. Behind a reverse proxy, SvelteKit can't determine the correct origin on its own and will reject requests with a **silent 403** — the rejection happens before the request reaches app-level logging, so nothing appears in `docker logs` or application output.

**Set the `ORIGIN` environment variable** to your public URL (e.g., `ORIGIN=https://scrolly.example.com`):

- **Docker:** `docker-compose.yml` sets this automatically from `PUBLIC_APP_URL`. The Caddy overlay sets it from `DOMAIN`.
- **Manual:** Set `ORIGIN` in your shell environment or process manager config.

This only affects form submissions (SvelteKit form actions). API endpoints (`/api/*` routes via `+server.ts`) are not subject to CSRF origin checks.

**Troubleshooting:** If you see unexplained 403 errors on POST requests that don't appear in your app logs, check that `ORIGIN` matches the URL users access in their browser (protocol + domain, no trailing slash).

## PWA Configuration

**manifest.json:**
- `display: "standalone"`
- `share_target` (Android — receives shared URLs via share sheet)
- `start_url: "/"`
- Standard icon sizes (192x192, 512x512)

**Service Worker:**
- Cache app shell (HTML, CSS, JS) for offline access
- Cache video thumbnails
- Network-first strategy for API calls
- Offline fallback page
- Push notification handler (`push` and `notificationclick` events)
