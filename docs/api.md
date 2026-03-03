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

**Join a group:**
```
Request:  { "action": "join", "inviteCode": "abc123" }
Response: { "userId": "...", "group": { ... }, "needsOnboarding": true }
```
Sets a signed httpOnly session cookie. Resumes existing session if one exists.

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

### GET /api/clips
```
Query params: ?filter=unwatched|watched|favorites|uploads&sort=oldest|round-robin&limit=20&offset=0
Response: { "clips": [...], "hasMore": true }
```
Only returns clips with `status: 'ready'`. Default sort is `oldest` (chronological). `round-robin` interleaves clips across members so no single poster dominates the feed. The `watched` filter sorts by most-recently-watched instead.

Each clip includes: id, originalUrl, title, addedByUsername, addedByAvatar, status, durationSeconds, platform, contentType, creatorName, creatorUrl, createdAt, watched, favorited, reactions, commentCount, unreadCommentCount, viewCount, seenByOthers.

### POST /api/clips
```
Request:  { "url": "https://tiktok.com/...", "title": "optional caption" }
Response: { "clip": { "id", "status": "downloading", "contentType" } }   (201 Created)
```
Triggers the download pipeline via the active provider. Requires a download provider to be configured (see Settings). Returns immediately with status `downloading`.

### POST /api/clips/share
Authenticated via `?token=` query parameter (iOS Shortcut token). Allows sharing clips without a session cookie.
```
Request:  { "url": "https://tiktok.com/...", "phone": "+1234567890" }
Response: { "ok": true, "clipId": "...", "status": "downloading" }   (201 Created)
```

### GET /api/clips/[id]
Returns full clip detail with user context, interaction state, and metadata.
```
Response: { id, originalUrl, videoPath, audioPath, thumbnailPath, title, artist, albumArt, spotifyUrl, appleMusicUrl, youtubeMusicUrl, addedBy, addedByUsername, addedByAvatar, platform, status, contentType, durationSeconds, creatorName, creatorUrl, watched, favorited, reactions, commentCount, unreadCommentCount, viewCount, seenByOthers, createdAt, canEditCaption }
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

## Interactions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/clips/[id]/watched` | Mark clip as watched |
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

### POST /api/clips/[id]/watched
```
Request:  { "watchPercent": 85 }   (optional, 0–100)
Response: { "watched": true }
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
Response: { "title": "...", "creatorName": "...", "creatorUrl": "..." }
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

## Group Management

Host-only endpoints (unless noted). Requires `createdBy === currentUser`.

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/group/name` | Rename group |
| PATCH | `/api/group/accent` | Change accent color |
| PATCH | `/api/group/retention` | Set retention policy |
| PATCH | `/api/group/max-file-size` | Set max file size limit |
| PATCH | `/api/group/platforms` | Set platform filter |
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
