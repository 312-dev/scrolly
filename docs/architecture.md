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
│   │   │   │   ├── download.ts      # Odesli link resolution + audio download
│   │   │   │   └── publish.ts       # Publish music clip after trim
│   │   │   ├── audio/
│   │   │   │   ├── trim.ts            # FFmpeg audio trimming
│   │   │   │   └── waveform.ts        # Waveform peak generation
│   │   │   ├── sms/
│   │   │   │   └── verify.ts        # Twilio SMS verification codes
│   │   │   ├── auth.ts              # Session management, invite code validation
│   │   │   ├── push.ts              # web-push wrapper, group notifications
│   │   │   ├── share-limit.ts       # Daily share limit enforcement utility
│   │   │   ├── scheduler.ts         # Retention policy enforcement (periodic cleanup)
│   │   │   └── download-lock.ts     # Prevents duplicate concurrent downloads
│   │   ├── components/
│   │   │   ├── ReelItem.svelte      # Individual reel (video or music)
│   │   │   ├── ReelVideo.svelte     # Video player within a reel
│   │   │   ├── ReelMusic.svelte     # Music player within a reel
│   │   │   ├── ReelOverlay.svelte   # Bottom overlay (user info, caption)
│   │   │   ├── ReelIndicators.svelte # Mute/play/speed flash indicators
│   │   │   ├── ActionSidebar.svelte # Right-side action buttons (+ MusicDisc for music clips)
│   │   │   ├── MusicDisc.svelte     # Spinning album art disc (music clips, inside ActionSidebar)
│   │   │   ├── MusicTrimModal.svelte  # Music clip trim interface
│   │   │   ├── CommentPrompt.svelte # Comment bar at bottom of reel
│   │   │   ├── ProgressBar.svelte   # Scrubable playback progress bar
│   │   │   ├── SkeletonReel.svelte  # Loading skeleton for reel
│   │   │   ├── BaseSheet.svelte     # Shared drag-to-dismiss bottom sheet base
│   │   │   ├── ClipOverlay.svelte   # Full-screen single-clip overlay view
│   │   │   ├── CommentsSheet.svelte # Bottom sheet for comments
│   │   │   ├── ViewersSheet.svelte  # Floating panel for view list
│   │   │   ├── ActivitySheet.svelte # Bottom sheet for in-app notifications
│   │   │   ├── GifPicker.svelte     # GIPHY search/picker (full or compact carousel mode)
│   │   │   ├── AddVideo.svelte      # Add video form
│   │   │   ├── AddVideoModal.svelte # Modal wrapper for AddVideo
│   │   │   ├── AvatarCropModal.svelte # Profile picture crop UI
│   │   │   ├── CatchUpModal.svelte  # Catch-up modal for bulk unwatched clips
│   │   │   ├── MeGrid.svelte         # Profile clip grid (favorites/uploads)
│   │   │   ├── MeReelView.svelte     # Profile reel overlay view
│   │   │   ├── CommentInput.svelte  # Rich comment input with GIF and mention support
│   │   │   ├── CommentRow.svelte    # Single comment row with hearts and replies
│   │   │   ├── MentionInput.svelte  # Input with @mention autocomplete
│   │   │   ├── MentionText.svelte   # Rendered mention text
│   │   │   ├── ReactionPicker.svelte
│   │   │   ├── ReelOverlayActions.svelte # Reaction pills on reel overlay
│   │   │   ├── EmojiShower.svelte   # Animated emoji celebration
│   │   │   ├── ConfirmDialog.svelte
│   │   │   ├── TrimWaveform.svelte    # Waveform visualization with trim handles
│   │   │   ├── ToastStack.svelte    # Toast notification stack
│   │   │   ├── InstallBanner.svelte # PWA install prompt
│   │   │   ├── SwUpdateToast.svelte # Service worker update prompt
│   │   │   ├── UploadStatus.svelte  # Background upload progress indicator
│   │   │   ├── SpeedPill.svelte     # Playback speed indicator pill
│   │   │   ├── ViewBadge.svelte     # View count badge
│   │   │   ├── PlatformIcon.svelte  # Platform logo (TikTok, IG, etc.)
│   │   │   ├── InlineError.svelte
│   │   │   ├── FilterBar.svelte     # Feed filter tabs
│   │   │   ├── ShareLimitDots.svelte # Daily share limit indicator dots
│   │   │   ├── ShortcutGuideSheet.svelte # iOS Shortcut setup guide
│   │   │   ├── ShortcutUpgradeBanner.svelte # Legacy shortcut upgrade prompt
│   │   │   └── settings/
│   │   │       ├── GroupNameEdit.svelte
│   │   │       ├── InviteLink.svelte
│   │   │       ├── MemberList.svelte
│   │   │       ├── DailyShareLimitPicker.svelte # Daily per-user share limit control
│   │   │       ├── RetentionPicker.svelte
│   │   │       ├── SkippedClips.svelte    # Dismissed/skipped clips viewer with restore
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
│   │   │   ├── activitySheet.ts    # Activity/notifications sheet state
│   │   │   ├── members.ts          # Group members list cache
│   │   │   ├── sheetOpen.ts        # Global any-sheet-open state (blocks scroll/nav)
│   │   │   ├── uiHidden.ts         # Feed UI hidden state (synced from active reel)
│   │   │   ├── homeTap.ts          # Double-tap home to scroll to top
│   │   │   ├── catchUpModal.ts     # Catch-up modal dismissal state (12-hour cooldown)
│   │   │   ├── shortcutNudge.ts    # Share shortcut install nudge
│   │   │   └── shortcutUpgrade.ts  # Shortcut upgrade banner state
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
│   │   │   │   ├── dismiss/+server.ts       # Dismiss/restore unwatched clips
│   │   │   │   ├── dismissed/+server.ts     # List dismissed clips
│   │   │   │   └── [id]/refetch/+server.ts  # Host-only metadata refetch
│   │   │   │   └── [id]/trim/+server.ts      # Music clip trim
│   │   │   │   └── [id]/waveform/+server.ts  # Waveform data
│   │   │   │   └── [id]/publish/+server.ts   # Publish after trim
│   │   │   ├── gifs/
│   │   │   ├── group/
│   │   │   ├── notifications/
│   │   │   │   └── [id]/+server.ts          # Delete single notification
│   │   │   ├── profile/
│   │   │   │   └── stats/+server.ts          # User profile stats
│   │   │   ├── push/
│   │   │   ├── videos/
│   │   │   ├── thumbnails/
│   │   │   └── health/
│   │   └── (app)/                   # Authenticated route group
│   │       ├── +page.svelte         # Feed (TikTok-style reel)
│   │       ├── me/+page.svelte      # Profile page (avatar, stats, faves/uploads)
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

### Reverse Proxy Configuration

Scrolly works behind any reverse proxy (Caddy, nginx, Nginx Proxy Manager, etc.). Three environment variables must be set on the Scrolly container:

| Variable | Example | Purpose |
|----------|---------|---------|
| `ORIGIN` | `https://scrolly.example.com` | CSRF protection — must match public URL |
| `ADDRESS_HEADER` | `X-Forwarded-For` | Tells SvelteKit to read client IP from proxy header |
| `XFF_DEPTH` | `1` | Number of trusted proxies (1 for a single proxy like NPM or Caddy) |

**`ORIGIN`** — SvelteKit's CSRF protection checks the `Origin` header on form submissions. Behind a proxy, SvelteKit can't determine the correct origin and silently rejects requests with a **403** that never reaches app-level logging. Set `ORIGIN` to your public URL (protocol + domain, no trailing slash).

- **Docker:** Set in `docker-compose.yml` (from `PUBLIC_APP_URL` or `DOMAIN`).
- **Manual:** Set in your shell environment or process manager config.

**`ADDRESS_HEADER` + `XFF_DEPTH`** — By default, SvelteKit's `getClientAddress()` returns the socket IP, which behind a proxy is the proxy's internal IP (e.g., `172.17.0.1`). This breaks rate limiting — all users share one bucket. Setting `ADDRESS_HEADER=X-Forwarded-For` tells adapter-node to read the real client IP from the proxy header. `XFF_DEPTH` controls how many rightmost IPs to skip (to prevent client spoofing). Set to `1` for a single proxy.

**Troubleshooting:**
- **Silent 403 on POST requests** that don't appear in app logs → `ORIGIN` doesn't match the browser URL.
- **All users rate-limited together** → `ADDRESS_HEADER` not set; rate limiter sees the proxy IP for everyone.

### Nginx / Nginx Proxy Manager

NPM automatically forwards `X-Forwarded-For` — no custom location or header configuration needed for IP forwarding or rate limiting (rate limiting is handled at the app level).

**Required: proxy buffer size increase.** Scrolly sets a signed session cookie plus preference cookies on every authenticated response. If the combined `Set-Cookie` headers exceed nginx's default 4KB buffer, nginx returns an **instant 502** for authenticated users only. Unauthenticated users and direct connections are unaffected.

**Symptom:** Authenticated users get 502s through the proxy. Deleting cookies in the browser resolves it. Nginx error log shows:
```
upstream sent too big header while reading response header from upstream
```

**Fix — standard nginx config:**
```nginx
proxy_buffer_size        32k;
proxy_buffers            4 32k;
proxy_busy_buffers_size  64k;
large_client_header_buffers 4 32k;
```

**Fix — Nginx Proxy Manager:**

Edit your proxy host → Advanced tab → paste into Custom Nginx Configuration:
```nginx
proxy_buffer_size        32k;
proxy_buffers            4 32k;
proxy_busy_buffers_size  64k;
large_client_header_buffers 4 32k;
```

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
