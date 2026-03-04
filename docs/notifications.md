# Notifications

Scrolly has two notification systems: an **in-app activity feed** and **web push notifications**.

## In-App Activity Feed

The in-app activity feed shows a chronological list of notifications via the `ActivitySheet` component. Users see:
- New clips added by other group members
- Reactions on their clips
- Comments on their clips

All notification types are stored in the `notifications` database table with read/unread tracking. The bottom navigation shows an unread badge count. Users can dismiss individual notifications via the `DELETE /api/notifications/[id]` endpoint.

### Auto-Clear Behavior

Certain user actions automatically delete related notifications to keep the activity feed clean:
- **Watching a clip** deletes any `new_clip` notification for that clip
- **Viewing comments** on a clip deletes `comment`, `reply`, and `mention` notifications for that clip

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | Paginated notification feed |
| DELETE | `/api/notifications/[id]` | Delete a single notification |
| POST | `/api/notifications/mark-read` | Mark notifications as read (all or by clip/type) |
| GET | `/api/notifications/unread-count` | Unread badge count |
| GET | `/api/notifications/preferences` | Fetch notification preferences |
| PATCH | `/api/notifications/preferences` | Update notification preferences |

## Push Notifications

Real-time push notifications via the Web Push Protocol (VAPID).

### Notification Types

| Event | Who gets notified | When sent | Preference key |
|-------|-------------------|-----------|----------------|
| New clip added | All group members except poster (push only) | After download succeeds (`status: 'ready'`) | `newAdds` |
| Reaction on a clip | Clip owner only (push + in-app) | Immediately after reaction is persisted | `reactions` |
| Comment on a clip | All group members except commenter (push + in-app) | Immediately after comment is persisted | `comments` |
| Reply to a comment | All group members except replier (push + in-app) | Immediately after reply is persisted | `comments` |
| Daily reminder | Per-user opt-in | — | `dailyReminder` (not yet scheduled) |

**Timing rationale:** New clip notifications are deferred until the download pipeline finishes successfully. This avoids notifying users about clips that may fail to download. If a download fails, no notification is sent. Reactions and comments notify immediately since the action is already complete.

### Push Notification Payload

All push notifications include these fields:

| Field | Type | Description |
|-------|------|-------------|
| title | string | Notification title |
| body | string | Notification body text |
| icon | string? | Icon URL |
| url | string? | Deep link target (defaults to '/') |
| tag | string? | Notification grouping tag |
| image | string? | Image URL for rich notifications |
| badgeCount | number? | Unwatched clip count for app badge |

The `badgeCount` is computed server-side per user/group and used by the service worker to call `navigator.setAppBadge()` on supported platforms.

### Customization

Users can toggle each notification type on/off in Settings. Preferences are stored in the `notification_preferences` table (created automatically on onboarding).

### Platform Support

| Platform | Support | Notes |
|----------|---------|-------|
| Android PWA | Full | Images, actions, badges |
| Desktop (Chrome, Edge, Firefox) | Full | Standard web push |
| iOS PWA (16.4+) | Limited | Text-only, no images. Must be added to Home Screen. |
| iOS Safari | None | Push only works from installed PWA, not browser. |

**iOS-specific requirements:**
- PWA must be installed to the Home Screen (Add to Home Screen from Safari share sheet)
- Push only works on iOS 16.4+
- No silent/background push
- Badge API (`navigator.setAppBadge`) available for unread count on Home Screen icon

### Setup

**1. Generate VAPID keys:**
```bash
npx web-push generate-vapid-keys
```

**2. Add keys to `.env`:**
```env
VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
VAPID_SUBJECT=mailto:you@example.com
```

**3. Enable in the app:**
1. Open Settings
2. Toggle **Enable notifications** on
3. Allow the browser notification permission prompt
4. Choose which categories to receive

### Architecture

| Layer | File | Role |
|-------|------|------|
| Server push utility | `src/lib/server/push.ts` | VAPID init, `sendNotification()`, `sendGroupNotification()`, `notifyNewClip()` |
| Subscribe API | `src/routes/api/push/subscribe/+server.ts` | POST/DELETE push subscriptions |
| Test API | `src/routes/api/push/test/+server.ts` | POST test notification to current user |
| Notifications API | `src/routes/api/notifications/+server.ts` | GET notification feed |
| Delete notification API | `src/routes/api/notifications/[id]/+server.ts` | DELETE single notification |
| Mark-read API | `src/routes/api/notifications/mark-read/+server.ts` | POST mark as read |
| Unread-count API | `src/routes/api/notifications/unread-count/+server.ts` | GET unread badge count |
| Preferences API | `src/routes/api/notifications/preferences/+server.ts` | GET/PATCH preferences |
| Service worker | `src/service-worker.ts` | `push` and `notificationclick` event handlers |
| Client helpers | `src/lib/push.ts` | Permission request, subscribe/unsubscribe |
| Notification store | `src/lib/stores/notifications.ts` | Client-side polling and unread count |
| Settings UI | `src/routes/(app)/settings/+page.svelte` | Push toggle and preference controls |
| Activity sheet | `src/lib/components/ActivitySheet.svelte` | In-app notification feed (bottom sheet) |

### Database Tables

- `notifications` — stores each notification with type, actor, clip reference, read status, and optional emoji/comment preview. Indexed on `(user_id, created_at)`.
- `push_subscriptions` — stores each device's push endpoint and encryption keys per user.
- `notification_preferences` — per-user boolean toggles for each notification category (created automatically on onboarding).
