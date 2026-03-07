import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const groups = sqliteTable('groups', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	inviteCode: text('invite_code').notNull().unique(),
	retentionDays: integer('retention_days'),
	maxStorageMb: integer('max_storage_mb'),
	maxFileSizeMb: integer('max_file_size_mb').default(500),
	accentColor: text('accent_color').notNull().default('coral'),
	downloadProvider: text('download_provider'),
	platformFilterMode: text('platform_filter_mode').notNull().default('all'),
	platformFilterList: text('platform_filter_list'),
	dailyShareLimit: integer('daily_share_limit'),
	shortcutToken: text('shortcut_token').unique(),
	shortcutUrl: text('shortcut_url'),
	createdBy: text('created_by'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull(),
	phone: text('phone').notNull().unique(),
	groupId: text('group_id')
		.notNull()
		.references(() => groups.id),
	themePreference: text('theme_preference').notNull().default('system'),
	autoScroll: integer('auto_scroll', { mode: 'boolean' }).notNull().default(false),
	mutedByDefault: integer('muted_by_default', { mode: 'boolean' }).notNull().default(true),
	feedSortOrder: text('feed_sort_order').notNull().default('oldest'),
	avatarPath: text('avatar_path'),
	lastLegacyShareAt: integer('last_legacy_share_at', { mode: 'timestamp' }),
	usedNewShareFlow: integer('used_new_share_flow', { mode: 'boolean' }).notNull().default(false),
	removedAt: integer('removed_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const clips = sqliteTable(
	'clips',
	{
		id: text('id').primaryKey(),
		groupId: text('group_id')
			.notNull()
			.references(() => groups.id),
		addedBy: text('added_by')
			.notNull()
			.references(() => users.id),
		originalUrl: text('original_url').notNull(),
		videoPath: text('video_path'),
		thumbnailPath: text('thumbnail_path'),
		title: text('title'),
		durationSeconds: integer('duration_seconds'),
		platform: text('platform').notNull(),
		status: text('status').notNull().default('downloading'),
		contentType: text('content_type').notNull().default('video'),
		audioPath: text('audio_path'),
		artist: text('artist'),
		albumArt: text('album_art'),
		spotifyUrl: text('spotify_url'),
		appleMusicUrl: text('apple_music_url'),
		youtubeMusicUrl: text('youtube_music_url'),
		fileSizeBytes: integer('file_size_bytes'),
		creatorName: text('creator_name'),
		creatorUrl: text('creator_url'),
		sourceViewCount: integer('source_view_count'),
		trimDeadline: integer('trim_deadline', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('clips_group_url').on(table.groupId, table.originalUrl)]
);

export const comments = sqliteTable('comments', {
	id: text('id').primaryKey(),
	clipId: text('clip_id')
		.notNull()
		.references(() => clips.id),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	parentId: text('parent_id'),
	text: text('text').notNull(),
	gifUrl: text('gif_url'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const commentHearts = sqliteTable(
	'comment_hearts',
	{
		id: text('id').primaryKey(),
		commentId: text('comment_id')
			.notNull()
			.references(() => comments.id),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('comment_hearts_unique').on(table.commentId, table.userId)]
);

export const reactions = sqliteTable(
	'reactions',
	{
		id: text('id').primaryKey(),
		clipId: text('clip_id')
			.notNull()
			.references(() => clips.id),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		emoji: text('emoji').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('reactions_unique').on(table.clipId, table.userId, table.emoji)]
);

export const watched = sqliteTable(
	'watched',
	{
		clipId: text('clip_id')
			.notNull()
			.references(() => clips.id),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		watchPercent: integer('watch_percent'),
		watchedAt: integer('watched_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('watched_clip_user').on(table.clipId, table.userId)]
);

export const favorites = sqliteTable('favorites', {
	clipId: text('clip_id')
		.notNull()
		.references(() => clips.id),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	endpoint: text('endpoint').notNull(),
	keysP256dh: text('keys_p256dh').notNull(),
	keysAuth: text('keys_auth').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const verificationCodes = sqliteTable('verification_codes', {
	id: text('id').primaryKey(),
	phone: text('phone').notNull(),
	code: text('code').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	attempts: integer('attempts').notNull().default(0),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	verifiedAt: integer('verified_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const notifications = sqliteTable(
	'notifications',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		type: text('type').notNull(),
		clipId: text('clip_id')
			.notNull()
			.references(() => clips.id),
		actorId: text('actor_id')
			.notNull()
			.references(() => users.id),
		emoji: text('emoji'),
		commentPreview: text('comment_preview'),
		readAt: integer('read_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('notifications_user_created').on(table.userId, table.createdAt)]
);

export const commentViews = sqliteTable(
	'comment_views',
	{
		clipId: text('clip_id')
			.notNull()
			.references(() => clips.id),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		viewedAt: integer('viewed_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('comment_views_unique').on(table.clipId, table.userId)]
);

export const dismissedClips = sqliteTable(
	'dismissed_clips',
	{
		clipId: text('clip_id')
			.notNull()
			.references(() => clips.id),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		dismissedAt: integer('dismissed_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('dismissed_clips_unique').on(table.clipId, table.userId)]
);

export const notificationPreferences = sqliteTable('notification_preferences', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id),
	newAdds: integer('new_adds', { mode: 'boolean' }).notNull().default(true),
	reactions: integer('reactions', { mode: 'boolean' }).notNull().default(true),
	comments: integer('comments', { mode: 'boolean' }).notNull().default(true),
	mentions: integer('mentions', { mode: 'boolean' }).notNull().default(true),
	dailyReminder: integer('daily_reminder', { mode: 'boolean' }).notNull().default(false)
});
