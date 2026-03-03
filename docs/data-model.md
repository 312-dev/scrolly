# Data Model

SQLite database via Drizzle ORM. All IDs are UUIDs stored as text. Timestamps are Unix epoch integers.

## Tables

### groups

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| name | text | Group display name |
| invite_code | text | Unique. Used to join the group. |
| retention_days | integer | Nullable. Days before auto-delete. |
| max_storage_mb | integer | Nullable. Storage cap for the group. |
| max_file_size_mb | integer | Default 500. Per-file size limit in MB. |
| accent_color | text | Default `'coral'`. Host-configurable group accent color. |
| download_provider | text | Nullable. Active download provider ID. |
| platform_filter_mode | text | Default `'all'`. `'all'` / `'allow'` / `'block'`. |
| platform_filter_list | text | Nullable. Comma-separated list of platforms for allow/block filtering. |
| shortcut_token | text | Nullable, unique. Token for iOS Shortcut clip sharing. |
| shortcut_url | text | Nullable. URL for iOS Shortcut integration. |
| created_by | text | FK → users.id (host/admin) |
| created_at | integer | Unix timestamp |

### users

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| username | text | Unique within group |
| phone | text | Required, E.164 format (+1234567890). Used for SMS verification and iOS Shortcut auth. Unique across system. |
| group_id | text | FK → groups.id |
| theme_preference | text | `'system'` / `'light'` / `'dark'`. Default `'system'`. |
| auto_scroll | integer | Boolean (0/1). Default 0. |
| muted_by_default | integer | Boolean (0/1). Default 1. |
| feed_sort_order | text | `'oldest'` / `'round-robin'`. Default `'oldest'`. |
| avatar_path | text | Nullable. Path to uploaded profile picture. |
| removed_at | integer | Nullable. Unix timestamp when removed from group. |
| created_at | integer | Unix timestamp |

### clips

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| group_id | text | FK → groups.id |
| added_by | text | FK → users.id |
| original_url | text | Source URL. Preserved even after video deletion. Unique per group. |
| video_path | text | Nullable. Local filesystem path to downloaded video. |
| thumbnail_path | text | Nullable. Path to thumbnail image. |
| title | text | User-provided caption, source metadata, or AI-generated. |
| duration_seconds | integer | Nullable |
| platform | text | `'tiktok'` / `'instagram'` / `'youtube'` / etc. |
| status | text | `'downloading'` / `'pending_trim'` / `'ready'` / `'failed'` / `'deleted'` |
| content_type | text | `'video'` / `'music'`. Default `'video'`. |
| audio_path | text | Nullable. Path to audio file (music clips). |
| artist | text | Nullable. Artist name (music clips). |
| album_art | text | Nullable. Album art URL or path (music clips). |
| spotify_url | text | Nullable. Cross-platform Spotify link (music clips). |
| apple_music_url | text | Nullable. Cross-platform Apple Music link (music clips). |
| youtube_music_url | text | Nullable. Cross-platform YouTube Music link (music clips). |
| trim_deadline | integer | Nullable. Unix timestamp deadline for auto-publish if user doesn't trim. |
| file_size_bytes | integer | Nullable. File size for storage tracking. |
| creator_name | text | Nullable. Original content creator name (from yt-dlp metadata). |
| creator_url | text | Nullable. Original content creator profile URL. |
| created_at | integer | Unix timestamp |

Unique index on `(group_id, original_url)` — prevents duplicate URLs within a group.

### comments

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| clip_id | text | FK → clips.id |
| user_id | text | FK → users.id |
| parent_id | text | Nullable. FK → comments.id for threaded replies. |
| text | text | Comment body |
| gif_url | text | Nullable. URL of attached GIF (via Giphy). |
| created_at | integer | Unix timestamp |

### comment_hearts

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| comment_id | text | FK → comments.id |
| user_id | text | FK → users.id |
| created_at | integer | Unix timestamp |

Unique constraint on `(comment_id, user_id)` — one heart per user per comment.

### reactions

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| clip_id | text | FK → clips.id |
| user_id | text | FK → users.id |
| emoji | text | e.g., '😂', '🔥', '❤️' |
| created_at | integer | Unix timestamp |

Unique constraint on `(clip_id, user_id, emoji)` — one of each emoji per user per clip.

### watched

| Column | Type | Notes |
|--------|------|-------|
| clip_id | text | Composite PK, FK → clips.id |
| user_id | text | Composite PK, FK → users.id |
| watch_percent | integer | Nullable. How far the user watched (0–100). |
| watched_at | integer | Unix timestamp |

### favorites

| Column | Type | Notes |
|--------|------|-------|
| clip_id | text | Composite PK, FK → clips.id |
| user_id | text | Composite PK, FK → users.id |
| created_at | integer | Unix timestamp |

### notifications

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| user_id | text | FK → users.id |
| type | text | `'new_clip'` / `'reaction'` / `'comment'` / etc. |
| clip_id | text | FK → clips.id |
| actor_id | text | FK → users.id (who triggered the notification) |
| emoji | text | Nullable. For reaction notifications. |
| comment_preview | text | Nullable. Truncated comment text for comment notifications. |
| read_at | integer | Nullable. Unix timestamp when read. |
| created_at | integer | Unix timestamp |

Index on `(user_id, created_at)` for efficient feed queries.

### comment_views

| Column | Type | Notes |
|--------|------|-------|
| clip_id | text | FK → clips.id |
| user_id | text | FK → users.id |
| viewed_at | integer | Unix timestamp |

Unique constraint on `(clip_id, user_id)` — tracks whether a user has seen the comments on a clip.

### push_subscriptions

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| user_id | text | FK → users.id |
| endpoint | text | Web Push endpoint URL |
| keys_p256dh | text | Public key for encryption |
| keys_auth | text | Auth secret |
| created_at | integer | Unix timestamp |

### notification_preferences

| Column | Type | Notes |
|--------|------|-------|
| user_id | text | PK, FK → users.id |
| new_adds | integer | Boolean (0/1). Default 1. |
| reactions | integer | Boolean (0/1). Default 1. |
| comments | integer | Boolean (0/1). Default 1. |
| daily_reminder | integer | Boolean (0/1). Default 0. |

### verification_codes

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK, UUID |
| phone | text | Phone number being verified. |
| code | text | SMS verification code. |
| user_id | text | FK → users.id |
| attempts | integer | Number of verification attempts. Default 0. |
| expires_at | integer | Unix timestamp when code expires. |
| verified_at | integer | Nullable. Unix timestamp when successfully verified. |
| created_at | integer | Unix timestamp |

## Relationships

```
groups 1──∞ users
groups 1──∞ clips
users  1──∞ clips (added_by)
users  1──∞ comments
users  1──∞ reactions
users  1──∞ comment_hearts
clips  1──∞ comments
clips  1──∞ reactions
comments 1──∞ comments (parent_id, threaded replies)
comments 1──∞ comment_hearts
clips  ∞──∞ users (watched)
clips  ∞──∞ users (favorites)
clips  ∞──∞ users (comment_views)
users  1──∞ push_subscriptions
users  1──1 notification_preferences
users  1──∞ notifications (recipient)
users  1──∞ notifications (actor)
clips  1──∞ notifications
users  1──∞ verification_codes
```

## Notes

- **Soft delete for clips:** When retention policy removes a video, the clip record stays with `status = 'deleted'` and `original_url` preserved so users can still visit the source.
- **Soft delete for users:** Removed members keep their record with `removed_at` set, preserving attribution on their clips and comments.
- **Phone uniqueness:** Phone numbers are unique across the system (a user can only belong to one group). If multi-group support is added later, this constraint would change.
- **SQLite booleans:** Stored as integers (0/1) since SQLite has no native boolean type. Drizzle uses `{ mode: 'boolean' }` for type-safe access.
- **Music clips:** The `content_type` field distinguishes video clips from music links. Music clips have additional fields for cross-platform streaming URLs resolved via Odesli.
- **Duplicate URL prevention:** A unique index on `(group_id, original_url)` prevents the same link from being shared twice within a group.
- **Music clip trim workflow:** Music clips enter `pending_trim` status after download. The user can trim audio via the trim UI or skip trimming. If neither occurs before `trim_deadline`, the clip auto-publishes to `ready` status via the scheduler.
