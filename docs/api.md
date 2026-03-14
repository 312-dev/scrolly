# API Endpoints

All API routes are SvelteKit `+server.ts` files under `src/routes/api/`. Authenticated endpoints require a valid session cookie. Errors return JSON `{ error: string }` with an appropriate HTTP status.

## Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth` | Current user info + group info |
| POST | `/api/auth` | Join, login, verify phone, or onboard |

### GET /api/auth
```
Response: { user: { id, username, phone, groupId, themePreference, autoScroll, mutedByDefault, avatarPath }, group: { id, name, inviteCode, accentColor, retentionDays, ... } }
```

### POST /api/auth
Dispatches by `action` field in the request body:

**Join a group (legacy API — prefer `/join/[code]` page flow):**
```
Request:  { "action": "join", "inviteCode": "abc123" }
Response: { "userId": "...", "group": { ... }, "needsOnboarding": true }
```
Sets a signed httpOnly session cookie. Creates a placeholder phone (`pending:{userId}`) to avoid unique constraint violations when multiple users are pre-onboarding. The primary join flow now uses the `/join/[code]` SvelteKit page with a form action instead of this API endpoint.

**Send login code:**
```
Request:  { "action": "login-send-code", "phone": "+1234567890" }
Response: { "sent": true }
```

**Verify login code:**
```
Request:  { "action": "login-verify-code", "phone": "+1234567890", "code": "123456" }
Response: { "userId": "...", "group": { ... } }
```

**Send verification code (during onboarding):**
```
Request:  { "action": "send-code", "phone": "+1234567890" }
Response: { "sent": true }
```

**Verify code (during onboarding):**
```
Request:  { "action": "verify-code", "phone": "+1234567890", "code": "123456" }
Response: { "verified": true }
```

**Complete onboarding:**
```
Request:  { "action": "onboard", "username": "jane", "phone": "+1234567890" }
Response: { "user": { ... }, "group": { ... } }
```

## Clips

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clips` | List clips for the user's group |
| POST | `/api/clips` | Submit a URL to download |
| POST | `/api/clips/share` | Submit a URL via shortcut token |
| GET | `/api/clips/[id]` | Single clip detail |
| PATCH | `/api/clips/[id]` | Update clip title |
| DELETE | `/api/clips/[id]` | Remove clip |
| GET | `/api/clips/unwatched-count` | Count of unwatched clips |
| POST | `/api/clips/dismiss` | Dismiss unwatched clips (bulk) |
| DELETE | `/api/clips/dismiss` | Restore dismissed clips |
| GET | `/api/clips/dismissed` | List dismissed clips for user |

### GET /api/clips
```
Query params: ?filter=unwatched|watched|favorites|uploads&sort=oldest|round-robin|best&limit=20&offset=0
Response: { "clips": [...], "hasMore": true }
```
Only returns clips with `status: 'ready'`. Default sort is `oldest` (chronological). `round-robin` interleaves clips across members so no single poster dominates the feed. `best` ranks clips by engagement (reactions + comments + views) with source view count as tiebreaker and round-robin balance. The `watched` filter sorts by most-recently-watched instead.

Each clip includes: id, originalUrl, title, addedByUsername, addedByAvatar, status, durationSeconds, platform, contentType, creatorName, creatorUrl, sourceViewCount, createdAt, watched, favorited, reactions, commentCount, unreadCommentCount, viewCount, seenByOthers.

### POST /api/clips
```
Request:  { "url": "https://tiktok.com/...", "title": "optional caption" }
Response: { "clip": { "id", "status": "downloading", "contentType" } }   (201 Created)
```
Triggers the download pipeline via the active provider. Requires a download provider to be configured (see Settings). Returns immediately with status `downloading`.

### POST /api/clips/share
Authenticated via `?token=` query parameter (iOS Shortcut token) or session cookie (web view). Allows sharing clips without a session cookie.
```
Request:  { "url": "https://tiktok.com/...", "phone": "+1234567890" }
Response: { "ok": true, "clipId": "...", "status": "downloading" }   (201 Created)
```
Also accepts `"phones": ["+1234567890"]` (array) for legacy Shortcut backward compatibility. Records legacy share timestamp for upgrade banner tracking.

### GET /api/clips/[id]
Returns full clip detail with user context, interaction state, and metadata.
```
Response: { id, originalUrl, videoPath, audioPath, thumbnailPath, title, artist, albumArt, spotifyUrl, appleMusicUrl, youtubeMusicUrl, addedBy, addedByUsername, addedByAvatar, platform, status, contentType, durationSeconds, creatorName, creatorUrl, sourceViewCount, watched, favorited, reactions, commentCount, unreadCommentCount, viewCount, seenByOthers, createdAt, canEditCaption }
```

### PATCH /api/clips/[id]
```
Request:  { "title": "new caption" }
Response: { "title": "new caption" }
```
Host-only. Only the group host can edit clip captions.

### DELETE /api/clips/[id]
Host can delete any clip. Non-host uploaders can only delete their own clips if no one else has watched them.

### GET /api/clips/unwatched-count
```
Response: { "count": 5 }
```

### POST /api/clips/dismiss
Bulk-dismiss unwatched clips. Skips already-watched and already-dismissed clips.
```
Request:  { "keepIds": ["clip-1", "clip-2"] }   (optional clips to exclude from dismissal)
Response: { "dismissed": 3 }
```

### DELETE /api/clips/dismiss
Restore previously dismissed clips.
```
Request:  { "clipIds": ["id1", "id2"] }   (specific clips)
Request:  { "all": true }                  (restore all dismissed clips)
Response: { "restored": 2 }
```

### GET /api/clips/dismissed
```
Response: { "clips": [...], "count": 3 }
```
Returns dismissed clips with thumbnail, platform, uploader info, and dismissal timestamp.

## Interactions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/clips/[id]/watched` | Mark clip as watched |
| PATCH | `/api/clips/[id]/watched` | Update watch percent only |
| DELETE | `/api/clips/[id]/watched` | Mark clip as unwatched |
| POST | `/api/clips/[id]/favorite` | Toggle favorite |
| GET | `/api/clips/[id]/views` | List who has viewed |
| GET | `/api/clips/[id]/comments` | List comments |
| POST | `/api/clips/[id]/comments` | Add a comment |
| DELETE | `/api/clips/[id]/comments` | Delete a comment |
| POST | `/api/clips/[id]/comments/[commentId]/heart` | Toggle heart on comment |
| POST | `/api/clips/[id]/comments/viewed` | Mark comments as viewed |
| GET | `/api/clips/[id]/reactions` | List reactions |
| POST | `/api/clips/[id]/reactions` | Toggle a reaction |
| POST | `/api/clips/[id]/retry` | Retry failed download |
| POST | `/api/clips/[id]/refetch` | Refetch metadata from source |
| POST | `/api/clips/[id]/trim` | Trim music clip audio |
| GET | `/api/clips/[id]/waveform` | Get waveform peaks for trim UI |
| POST | `/api/clips/[id]/publish` | Publish music clip (skip trim) |
| POST | `/api/clips/[id]/ping` | Extend trim deadline (heartbeat) |

### POST /api/clips/[id]/watched
```
Request:  { "watchPercent": 85 }   (optional, 0–100)
Response: { "watched": true }
```

### PATCH /api/clips/[id]/watched
Updates watch percent without marking the clip as watched. Only updates existing watched records — does not create new ones. Used for periodic progress tracking while the user is still viewing.
```
Request:  { "watchPercent": 85 }   (0–100)
Response: { "updated": true }
```

### POST /api/clips/[id]/favorite
Toggles favorite on/off. Also syncs with reactions: favoriting creates a ❤️ reaction (with notification), unfavoriting removes the paired ❤️ reaction and its notification.
```
Response: { "favorited": true }
```

### GET /api/clips/[id]/views
```
Response: { "views": [{ "userId", "username", "avatarPath", "watchPercent", "status", "watchedAt" }] }
```

### GET /api/clips/[id]/comments
Returns threaded comments with nested replies, heart counts, and user avatars.
```
Response: { "comments": [{ "id", "text", "user": { "username", "avatarPath" }, "parentId", "heartCount", "hearted", "replies": [...], "createdAt" }] }
```

### POST /api/clips/[id]/comments
```
Request:  { "text": "lmao", "parentId": "optional-comment-id" }
Response: { "comment": { "id", "text", "user": { ... }, "createdAt" } }
```

### POST /api/clips/[id]/comments/[commentId]/heart
Toggles heart on/off.
```
Response: { "heartCount": 3, "hearted": true }
```

### POST /api/clips/[id]/reactions
Enforces one reaction per user per clip. Posting a different emoji replaces the user's previous reaction. Posting the same emoji removes it.
```
Request:  { "emoji": "🔥" }
Response: { "reactions": { "🔥": { "count": 2, "reacted": true } }, "toggled": true }
```
Allowed emojis: ❤️ 👍 👎 😂 ‼️ ❓

### POST /api/clips/[id]/retry
Retries a failed download. Only available for clips with `status: 'failed'`.
```
Response: { "status": "downloading" }
```

### POST /api/clips/[id]/refetch
Host-only. Refetches metadata (title, creator info) from the source URL via yt-dlp.
```
Response: { "title": "...", "creatorName": "...", "creatorUrl": "...", "sourceViewCount": 12345 }
```

### POST /api/clips/[id]/trim
Trims a music clip's audio to the specified time range. Only available for clips with `contentType: 'music'`.
```
Request:  { "startSeconds": 15.0, "endSeconds": 45.0 }
Response: { "ok": true }
```

### GET /api/clips/[id]/waveform
Returns normalized waveform peak data for the clip's audio file, used by the trim UI.
```
Response: { "peaks": [0.1, 0.3, 0.8, ...] }   (200 values, normalized 0-1)
```

### POST /api/clips/[id]/publish
Publishes a music clip that is in `pending_trim` status, skipping the trim step.
```
Response: { "ok": true }
```

### POST /api/clips/[id]/ping
Extends the trim deadline for a music clip in `pending_trim` status. The client sends pings every 10s to keep the trim UI active. When pings stop, the server auto-publishes after the deadline (30s). Only the uploader can ping.
```
Response: { "ok": true }
```

## Clout (Reputation)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clout` | Get user's clout score, tier, and breakdown |
| POST | `/api/clout` | Acknowledge tier change modal was shown |

### GET /api/clout
Returns the user's clout score and tier when queue pacing is enabled. Clout is computed from the engagement on the user's last 10 eligible clips (watched by ≥75% of group). Users with fewer than 10 eligible clips default to Rising tier.
```
Response: {
  "enabled": true,
  "score": 0.8,
  "tier": "viral",
  "tierName": "Viral",
  "cooldownMinutes": 120,
  "burstSize": 3,
  "queueLimit": null,
  "icon": "/icons/clout/viral.png",
  "breakdown": [{ "clipId": "...", "score": 2 }, ...],
  "nextTier": { "tier": "iconic", "tierName": "Iconic", "minScore": 1.0, "burst": 5, "queueLimit": null, "icon": "..." },
  "lastTier": "rising",
  "tierChanged": true
}
```

**Tiers:** Fresh (<0.4) → Rising (0.4–0.6) → Viral (0.7–0.9) → Iconic (≥1.0). Each tier adjusts cooldown multiplier, burst size, and queue depth limit.

**Per-clip scoring:** 0 = no reactions/favorites from others, 1 = reaction or favorite but no comment, 2 = reaction/favorite AND comment. Self-interactions excluded. Only clips watched by ≥75% of other group members are eligible.

**Rank-down protection:** Rank-ups apply immediately. Rank-downs only take effect if the user has held their current tier for ≥4 days. The `cloutTierChangedAt` column tracks when the effective tier last changed.

**Tier change detection:** The server tracks each user's last effective tier (`cloutTier`) and when it changed (`cloutTierChangedAt`). When the tier actually changes (after rank-down protection), `tierChanged: true` is returned.

### POST /api/clout
Acknowledges that the tier change modal was shown. Updates the user's stored tier and resets the cooldown timer.
```
Response: { "ok": true }
```

## Queue Management

Manage queued clips when share pacing is enabled.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/queue` | List queued clips for user |
| DELETE | `/api/queue` | Clear entire queue |
| GET | `/api/queue/count` | Queued clip count |
| DELETE | `/api/queue/[id]` | Cancel a queued clip |
| POST | `/api/queue/[id]/move-to-top` | Move entry to top of queue |
| PATCH | `/api/queue/reorder` | Reorder queue entries |

### GET /api/queue
```
Response: { "queue": [{ "id", "clipId", "position", "scheduledAt", "sharesIn", "createdAt", "title", "originalUrl", "platform", "contentType", "status", "thumbnailPath" }] }
```

### DELETE /api/queue
Clears the entire queue for the user's group and deletes associated clips.
```
Response: { "cleared": 3 }
```

### GET /api/queue/count
```
Response: { "count": 5 }
```

### DELETE /api/queue/[id]
Cancels a single queued clip. Only the uploader can cancel.
```
Response: { "ok": true }
```

### POST /api/queue/[id]/move-to-top
Moves a queue entry to position 0 (next to publish).
```
Response: { "ok": true }
```

### PATCH /api/queue/reorder
Reorders all queue entries and recalculates scheduled publish times.
```
Request:  { "orderedIds": ["entry-id-1", "entry-id-2", "entry-id-3"] }
Response: { "ok": true }
```

## Group Management

Host-only endpoints (unless noted). Requires `createdBy === currentUser`.

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/group/name` | Rename group |
| PATCH | `/api/group/accent` | Change accent color |
| PATCH | `/api/group/retention` | Set retention policy |
| PATCH | `/api/group/max-file-size` | Set max file size limit |
| PATCH | `/api/group/platforms` | Set platform filter |
| PATCH | `/api/group/daily-share-limit` | Set daily share limit per user |
| PATCH | `/api/group/share-pacing` | Configure share pacing mode |
| GET | `/api/group/provider` | List download providers |
| PATCH | `/api/group/provider` | Set active provider |
| POST | `/api/group/provider/install` | Install a provider |
| DELETE | `/api/group/provider/install` | Uninstall a provider |
| POST | `/api/group/invite-code/regenerate` | Generate new invite code |
| PATCH | `/api/group/shortcut` | Set iOS Shortcut URL |
| POST | `/api/group/shortcut/regenerate-token` | Regenerate shortcut token |
| GET | `/api/group/members` | List group members |
| POST | `/api/group/members` | Add a member |
| DELETE | `/api/group/members/[userId]` | Remove a member |
| GET | `/api/group/clips` | List clips with storage info |
| DELETE | `/api/group/clips` | Batch delete clips |
| GET | `/api/group/stats` | Group statistics |

### PATCH /api/group/name
```
Request:  { "name": "The Squad" }   (1–50 chars)
```

### PATCH /api/group/accent
```
Request:  { "accentColor": "coral" }
Response: { "accentColor": "coral" }
```

### PATCH /api/group/retention
```
Request:  { "retentionDays": 30 }   (null, 7, 14, 30, 60, or 90)
Response: { "retentionDays": 30 }
```

### PATCH /api/group/max-file-size
```
Request:  { "maxFileSizeMb": 100 }   (null to remove limit)
Response: { "maxFileSizeMb": 100 }
```

### PATCH /api/group/platforms
```
Request:  { "mode": "all", "platforms": [] }   (mode: "all" | "allow" | "block")
Response: { "platformFilterMode": "all", "platformFilterList": null }
```

### PATCH /api/group/daily-share-limit
```
Request:  { "dailyShareLimit": 5 }   (positive integer, or null to remove limit)
Response: { "dailyShareLimit": 5 }
```

### PATCH /api/group/share-pacing
Host-only. Configures queue-based share pacing. When switching away from `queue` mode, all queued clips are flushed to `ready`.
```
Request:  { "sharePacingMode": "queue", "shareBurst": 2, "shareCooldownMinutes": 120, "dailyShareLimit": null, "cloutEnabled": true }
Response: { "sharePacingMode": "queue", "shareBurst": 2, "shareCooldownMinutes": 120, "dailyShareLimit": null, "cloutEnabled": true }
```
- `sharePacingMode`: `"off"` | `"daily_cap"` | `"queue"`
- `shareBurst`: 1–10 (clips per scheduled time slot)
- `shareCooldownMinutes`: 30 | 60 | 120 | 240 | 360
- `dailyShareLimit`: positive integer or null
- `cloutEnabled`: boolean (enables reputation-based queue adjustments)

### GET /api/group/provider
```
Response: { "providers": [{ "id", "name", "installed", "version", ... }] }
```

### PATCH /api/group/provider
```
Request:  { "providerId": "yt-dlp" }   (null to unset)
Response: { "downloadProvider": "yt-dlp" }
```

### POST /api/group/provider/install
```
Request:  { "providerId": "yt-dlp" }
Response: { "installed": true, "version": "..." }   (201 Created)
```

### DELETE /api/group/provider/install
```
Request:  { "providerId": "yt-dlp" }
Response: { "installed": false }
```

### POST /api/group/invite-code/regenerate
```
Response: { "inviteCode": "new-code-here" }
```

### PATCH /api/group/shortcut
```
Request:  { "shortcutUrl": "https://..." }   (null to remove)
Response: { "shortcutUrl": "https://..." }
```

### POST /api/group/shortcut/regenerate-token
```
Response: { "shortcutToken": "new-token-here" }
```

### GET /api/group/members
```
Response: [{ "id", "username", "avatarPath", "createdAt", "isHost" }]
```

### POST /api/group/members
Host-only. Creates a new member in the group.
```
Request:  { "username": "jane", "phone": "+1234567890" }
Response: { "member": { "id", "username", "avatarPath", "createdAt", "isHost" } }   (201 Created)
```

### DELETE /api/group/members/[userId]
Soft-deletes the member (sets `removedAt`).

### GET /api/group/clips
```
Query params: ?sort=newest|largest&limit=20&offset=0
Response: { "clips": [...], "totalClips": 42, "totalSizeMb": 1200, "hasMore": true }
```

### DELETE /api/group/clips
```
Request:  { "clipIds": ["id1", "id2"] }
```

### GET /api/group/stats
```
Response: { "clipCount": 42, "memberCount": 8, "storageMb": 1200, "maxStorageMb": 5000 }
```

## Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | Paginated notification feed |
| DELETE | `/api/notifications/[id]` | Delete a single notification |
| POST | `/api/notifications/mark-read` | Mark notifications as read |
| GET | `/api/notifications/unread-count` | Unread notification count |
| GET | `/api/notifications/preferences` | Fetch notification preferences |
| PATCH | `/api/notifications/preferences` | Update notification preferences |

### GET /api/notifications
```
Query params: ?limit=30&offset=0
Response: { "notifications": [{ "id", "type", "clipId", "emoji", "commentPreview", "actorUsername", "actorAvatar", "clipThumbnail", "clipTitle", "clipContentType", "read", "createdAt" }] }
```

### DELETE /api/notifications/[id]
Deletes a single notification by ID for the current user.
```
Response: { "ok": true }
```

### POST /api/notifications/mark-read
```
Request:  { "all": true }             — mark all as read
Request:  { "clipId": "...", "type": "comment" }  — mark specific
```

### GET /api/notifications/unread-count
```
Response: { "count": 3 }
```

### PATCH /api/notifications/preferences
```
Request:  { "newAdds": true, "reactions": true, "comments": false, "dailyReminder": false }
Response: { "preferences": { ... } }
```

## Profile

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/profile/preferences` | Update user preferences |
| POST | `/api/profile/avatar` | Upload profile avatar |
| DELETE | `/api/profile/avatar` | Delete profile avatar |
| GET | `/api/profile/avatar/[filename]` | Serve avatar image |
| GET | `/api/profile/stats` | User profile statistics |

### POST /api/profile/preferences
```
Request:  { "themePreference": "dark", "autoScroll": true, "mutedByDefault": false, "feedSortOrder": "oldest" }
Response: { "themePreference": "dark", "autoScroll": true, "mutedByDefault": false, "feedSortOrder": "oldest" }
```
All fields optional — only provided fields are updated. `feedSortOrder` accepts `"oldest"` or `"round-robin"`.

### POST /api/profile/avatar
Upload a profile picture as `multipart/form-data`.
```
Response: { "avatarPath": "abc123.jpg" }
```

### DELETE /api/profile/avatar
```
Response: { "ok": true }
```

### GET /api/profile/avatar/[filename]
Serves the avatar image with JPEG content-type and cache headers.

### GET /api/profile/stats
Returns aggregate stats for the current user.
```
Response: { "uploads": 12, "saves": 45, "minutesWatched": 123.5 }
```

## GIFs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gifs/search` | Search or list trending GIFs |

### GET /api/gifs/search
Requires `GIPHY_API_KEY` to be configured.
```
Query params: ?q=funny&limit=20&offset=0
Response: { "gifs": [{ "id", "title", "url", "stillUrl", "width", "height" }] }
```

## Push Notifications

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/push/subscribe` | Register a push subscription |
| DELETE | `/api/push/subscribe` | Unregister |
| POST | `/api/push/test` | Send a test notification to current user |

### POST /api/push/subscribe
```
Request:  { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
Response: { "id": "subscription-id" }   (201 Created)
```

### POST /api/push/test
Sends a test push notification to the current user after a 10-second delay. Requires at least one active push subscription.
```
Response: { "sent": true, "sentAt": 1740000000000 }
```

## Media

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/videos/[filename]` | Serve video with range request support |
| GET | `/api/thumbnails/[filename]` | Serve thumbnail image |

Range requests (`Accept-Ranges: bytes`) are required for HTML5 `<video>` seeking. The server handles `Range` headers and returns `206 Partial Content`.

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |

```
Response: { "status": "ok", "version": "1.0.0", "uptime": 12345 }
```
