import { v4 as uuid } from 'uuid';
import * as schema from '../../src/lib/server/db/schema';
import type { TestDb } from './db';

export interface SeedResult {
	group: typeof schema.groups.$inferSelect;
	host: typeof schema.users.$inferSelect;
	member: typeof schema.users.$inferSelect;
	otherGroup: typeof schema.groups.$inferSelect;
	otherUser: typeof schema.users.$inferSelect;
	clip: typeof schema.clips.$inferSelect;
	readyClip: typeof schema.clips.$inferSelect;
}

export async function seed(db: TestDb): Promise<SeedResult> {
	const groupId = uuid();
	const otherGroupId = uuid();
	const hostId = uuid();
	const memberId = uuid();
	const otherUserId = uuid();
	const clipId = uuid();
	const readyClipId = uuid();
	const readyClip2Id = uuid();
	const now = new Date();

	db.insert(schema.groups)
		.values([
			{
				id: groupId,
				name: 'Test Group',
				inviteCode: 'test-invite-123',
				accentColor: 'coral',
				createdBy: hostId,
				createdAt: now
			},
			{
				id: otherGroupId,
				name: 'Other Group',
				inviteCode: 'other-invite-456',
				accentColor: 'violet',
				createdBy: otherUserId,
				createdAt: now
			}
		])
		.run();

	db.insert(schema.users)
		.values([
			{
				id: hostId,
				username: 'hostuser',
				phone: '+11111111111',
				groupId,
				createdAt: now
			},
			{
				id: memberId,
				username: 'member1',
				phone: '+12222222222',
				groupId,
				createdAt: now
			},
			{
				id: otherUserId,
				username: 'outsider',
				phone: '+13333333333',
				groupId: otherGroupId,
				createdAt: now
			}
		])
		.run();

	db.insert(schema.notificationPreferences)
		.values([{ userId: hostId }, { userId: memberId }, { userId: otherUserId }])
		.run();

	db.insert(schema.clips)
		.values([
			{
				id: clipId,
				groupId,
				addedBy: memberId,
				originalUrl: 'https://www.tiktok.com/@user/video/123',
				platform: 'tiktok',
				contentType: 'video',
				status: 'downloading',
				createdAt: now
			},
			{
				id: readyClipId,
				groupId,
				addedBy: hostId,
				originalUrl: 'https://www.instagram.com/reel/456',
				platform: 'instagram',
				contentType: 'video',
				status: 'ready',
				videoPath: 'videos/test-video.mp4',
				thumbnailPath: 'videos/test-thumb.jpg',
				title: 'Test Video',
				durationSeconds: 30,
				createdAt: new Date(now.getTime() - 60000)
			},
			{
				id: readyClip2Id,
				groupId,
				addedBy: memberId,
				originalUrl: 'https://www.youtube.com/shorts/789',
				platform: 'youtube',
				contentType: 'video',
				status: 'ready',
				videoPath: 'videos/test-video-2.mp4',
				thumbnailPath: 'videos/test-thumb-2.jpg',
				title: 'Another Video',
				durationSeconds: 15,
				createdAt: new Date(now.getTime() - 30000)
			}
		])
		.run();

	const group = (await db.query.groups.findFirst({
		where: (g, { eq }) => eq(g.id, groupId)
	}))!;
	const otherGroup = (await db.query.groups.findFirst({
		where: (g, { eq }) => eq(g.id, otherGroupId)
	}))!;
	const host = (await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.id, hostId)
	}))!;
	const member = (await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.id, memberId)
	}))!;
	const otherUser = (await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.id, otherUserId)
	}))!;
	const clip = (await db.query.clips.findFirst({
		where: (c, { eq }) => eq(c.id, clipId)
	}))!;
	const readyClip = (await db.query.clips.findFirst({
		where: (c, { eq }) => eq(c.id, readyClipId)
	}))!;

	return { group, host, member, otherGroup, otherUser, clip, readyClip };
}
