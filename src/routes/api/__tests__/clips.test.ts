import { describe, it, expect, vi } from 'vitest';
import { seed } from '../../../../tests/helpers/seed';
import { createMockEvent } from '../../../../tests/helpers/request';

// Mock external services
vi.mock('$lib/server/push', () => ({
	sendNotification: vi.fn().mockResolvedValue(undefined),
	sendGroupNotification: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/server/video/download', () => ({
	downloadVideo: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/server/music/download', () => ({
	downloadMusic: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/server/scheduler', () => ({
	startScheduler: vi.fn()
}));
vi.mock('$lib/server/providers/registry', () => ({
	getActiveProvider: vi.fn().mockResolvedValue({ id: 'ytdlp', name: 'yt-dlp' })
}));

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../../../../tests/helpers/db');
	return createTestDb();
});

const { db } = await import('$lib/server/db');
const data = await seed(db as any);

// Import route handlers AFTER mocks are set up
const clipsMod = await import('../clips/+server');
const clipIdMod = await import('../clips/[id]/+server');
const watchedMod = await import('../clips/[id]/watched/+server');
const favoriteMod = await import('../clips/[id]/favorite/+server');
const reactionsMod = await import('../clips/[id]/reactions/+server');

// ---------------------------------------------------------------------------
// GET /api/clips
// ---------------------------------------------------------------------------
describe('GET /api/clips', () => {
	it('returns 401 without auth', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			user: null,
			group: null
		});
		const res = await clipsMod.GET(event as any);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBeDefined();
	});

	it('returns ready clips for the user group', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.GET(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.clips).toBeInstanceOf(Array);
		expect(body.clips.length).toBeGreaterThanOrEqual(2);
		const ids = body.clips.map((c: any) => c.id);
		// Only ready clips appear in the feed (downloading clips are excluded)
		expect(ids).not.toContain(data.clip.id);
		expect(ids).toContain(data.readyClip.id);
	});

	it('does not return clips from other groups', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			user: data.otherUser,
			group: data.otherGroup
		});
		const res = await clipsMod.GET(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		const ids = body.clips.map((c: any) => c.id);
		expect(ids).not.toContain(data.clip.id);
		expect(ids).not.toContain(data.readyClip.id);
	});

	it('filters by unwatched', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			searchParams: { filter: 'unwatched' },
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.GET(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		// member has no watched records from seed, so both clips should appear
		expect(body.clips.length).toBeGreaterThanOrEqual(1);
	});

	it('filters by watched', async () => {
		// First mark the readyClip as watched by member
		const watchEvent = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.readyClip.id}/watched`,
			params: { id: data.readyClip.id },
			body: {},
			user: data.member,
			group: data.group
		});
		await watchedMod.POST(watchEvent as any);

		const event = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			searchParams: { filter: 'watched' },
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.GET(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		const ids = body.clips.map((c: any) => c.id);
		expect(ids).toContain(data.readyClip.id);
	});

	it('filters by favorites', async () => {
		// First favorite the readyClip
		const favEvent = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.readyClip.id}/favorite`,
			params: { id: data.readyClip.id },
			user: data.member,
			group: data.group
		});
		await favoriteMod.POST(favEvent as any);

		const event = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			searchParams: { filter: 'favorites' },
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.GET(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		const ids = body.clips.map((c: any) => c.id);
		expect(ids).toContain(data.readyClip.id);
	});

	it('paginates with limit and offset', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			searchParams: { limit: '1', offset: '0' },
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.GET(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.clips.length).toBe(1);
		expect(body.hasMore).toBe(true);

		// Fetch the next page
		const event2 = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			searchParams: { limit: '1', offset: '1' },
			user: data.member,
			group: data.group
		});
		const res2 = await clipsMod.GET(event2 as any);
		const body2 = await res2.json();
		expect(body2.clips.length).toBeGreaterThanOrEqual(1);
		// The two pages should not return the same clip
		expect(body2.clips[0].id).not.toBe(body.clips[0].id);
	});
});

// ---------------------------------------------------------------------------
// POST /api/clips
// ---------------------------------------------------------------------------
describe('POST /api/clips', () => {
	it('returns 401 without auth', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: '/api/clips',
			body: { url: 'https://www.tiktok.com/@user/video/999' },
			user: null,
			group: null
		});
		const res = await clipsMod.POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 when URL is missing', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: '/api/clips',
			body: {},
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.POST(event as any);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toMatch(/URL required/i);
	});

	it('returns 400 for unsupported URL', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: '/api/clips',
			body: { url: 'https://www.example.com/not-a-video' },
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.POST(event as any);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toMatch(/unsupported/i);
	});

	it('returns 201 for valid TikTok URL', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: '/api/clips',
			body: { url: 'https://www.tiktok.com/@newuser/video/99999' },
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.POST(event as any);
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.clip).toBeDefined();
		expect(body.clip.id).toBeDefined();
		expect(body.clip.status).toBe('downloading');
		expect(body.clip.contentType).toBe('video');
	});

	it('returns 409 for duplicate URL in same group', async () => {
		// The seed already has 'https://www.tiktok.com/@user/video/123'
		const event = createMockEvent({
			method: 'POST',
			path: '/api/clips',
			body: { url: 'https://www.tiktok.com/@user/video/123' },
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.POST(event as any);
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.error).toMatch(/already been added/i);
	});

	it('returns 400 when no download provider configured', async () => {
		const registry = await import('$lib/server/providers/registry');
		vi.mocked(registry.getActiveProvider).mockResolvedValueOnce(null);

		const event = createMockEvent({
			method: 'POST',
			path: '/api/clips',
			body: { url: 'https://www.tiktok.com/@user/video/provider-test' },
			user: data.member,
			group: data.group
		});
		const res = await clipsMod.POST(event as any);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toMatch(/no download provider/i);
	});

	it('auto-marks clip as watched by uploader', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: '/api/clips',
			body: { url: 'https://www.tiktok.com/@someone/video/77777' },
			user: data.host,
			group: data.group
		});
		const res = await clipsMod.POST(event as any);
		expect(res.status).toBe(201);
		const body = await res.json();

		// Simulate download completion — feed only returns ready clips
		const { clips } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		db.update(clips).set({ status: 'ready' }).where(eq(clips.id, body.clip.id)).run();

		// Verify the clip shows as watched when fetching clips for this user
		const getEvent = createMockEvent({
			method: 'GET',
			path: '/api/clips',
			searchParams: { filter: 'watched' },
			user: data.host,
			group: data.group
		});
		const getRes = await clipsMod.GET(getEvent as any);
		const getBody = await getRes.json();
		const ids = getBody.clips.map((c: any) => c.id);
		expect(ids).toContain(body.clip.id);
	});
});

// ---------------------------------------------------------------------------
// GET /api/clips/[id]
// ---------------------------------------------------------------------------
describe('GET /api/clips/[id]', () => {
	it('returns 401 without auth', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: `/api/clips/${data.readyClip.id}`,
			params: { id: data.readyClip.id },
			user: null,
			group: null
		});
		const res = await clipIdMod.GET(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 404 for nonexistent clip', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: '/api/clips/nonexistent-id',
			params: { id: 'nonexistent-id' },
			user: data.member,
			group: data.group
		});
		const res = await clipIdMod.GET(event as any);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toMatch(/not found/i);
	});

	it('returns 404 for clip in another group', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: `/api/clips/${data.readyClip.id}`,
			params: { id: data.readyClip.id },
			user: data.otherUser,
			group: data.otherGroup
		});
		const res = await clipIdMod.GET(event as any);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toMatch(/not found/i);
	});

	it('returns clip details when authorized', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: `/api/clips/${data.readyClip.id}`,
			params: { id: data.readyClip.id },
			user: data.host,
			group: data.group
		});
		const res = await clipIdMod.GET(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.id).toBe(data.readyClip.id);
		expect(body.status).toBe('ready');
		expect(body.videoPath).toBe('videos/test-video.mp4');
		expect(body.thumbnailPath).toBe('videos/test-thumb.jpg');
		expect(body.title).toBe('Test Video');
		expect(body.platform).toBe('instagram');
		expect(body.contentType).toBe('video');
	});
});

// ---------------------------------------------------------------------------
// DELETE /api/clips/[id]
// ---------------------------------------------------------------------------
describe('DELETE /api/clips/[id]', () => {
	it('returns 401 without auth', async () => {
		const event = createMockEvent({
			method: 'DELETE',
			path: `/api/clips/${data.clip.id}`,
			params: { id: data.clip.id },
			user: null,
			group: null
		});
		const res = await clipIdMod.DELETE(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 403 when not the uploader', async () => {
		// readyClip was added by host; member should not be able to delete
		const event = createMockEvent({
			method: 'DELETE',
			path: `/api/clips/${data.readyClip.id}`,
			params: { id: data.readyClip.id },
			user: data.member,
			group: data.group
		});
		const res = await clipIdMod.DELETE(event as any);
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toMatch(/uploader/i);
	});
});

// ---------------------------------------------------------------------------
// POST /api/clips/[id]/watched
// ---------------------------------------------------------------------------
describe('POST /api/clips/[id]/watched', () => {
	it('returns 401 without auth', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.readyClip.id}/watched`,
			params: { id: data.readyClip.id },
			body: {},
			user: null,
			group: null
		});
		const res = await watchedMod.POST(event as any);
		expect(res.status).toBe(401);
	});

	it('creates watched record', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.clip.id}/watched`,
			params: { id: data.clip.id },
			body: { watchPercent: 75 },
			user: data.host,
			group: data.group
		});
		const res = await watchedMod.POST(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.watched).toBe(true);
	});

	it('upserts watched record on repeated calls', async () => {
		// Call again with a higher watch percent
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.clip.id}/watched`,
			params: { id: data.clip.id },
			body: { watchPercent: 100 },
			user: data.host,
			group: data.group
		});
		const res = await watchedMod.POST(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.watched).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// POST /api/clips/[id]/favorite
// ---------------------------------------------------------------------------
describe('POST /api/clips/[id]/favorite', () => {
	it('returns 401 without auth', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.readyClip.id}/favorite`,
			params: { id: data.readyClip.id },
			user: null,
			group: null
		});
		const res = await favoriteMod.POST(event as any);
		expect(res.status).toBe(401);
	});

	it('toggles favorite on', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.clip.id}/favorite`,
			params: { id: data.clip.id },
			user: data.host,
			group: data.group
		});
		const res = await favoriteMod.POST(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.favorited).toBe(true);
	});

	it('toggles favorite off on second call', async () => {
		// Second call to the same clip should un-favorite
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.clip.id}/favorite`,
			params: { id: data.clip.id },
			user: data.host,
			group: data.group
		});
		const res = await favoriteMod.POST(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.favorited).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// GET /api/clips/[id]/reactions
// ---------------------------------------------------------------------------
describe('GET /api/clips/[id]/reactions', () => {
	it('returns 401 without auth', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: `/api/clips/${data.readyClip.id}/reactions`,
			params: { id: data.readyClip.id },
			user: null,
			group: null
		});
		const res = await reactionsMod.GET(event as any);
		expect(res.status).toBe(401);
	});

	it('returns empty reactions for a clip with none', async () => {
		const event = createMockEvent({
			method: 'GET',
			path: `/api/clips/${data.clip.id}/reactions`,
			params: { id: data.clip.id },
			user: data.member,
			group: data.group
		});
		const res = await reactionsMod.GET(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.reactions).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// POST /api/clips/[id]/reactions
// ---------------------------------------------------------------------------
describe('POST /api/clips/[id]/reactions', () => {
	it('returns 401 without auth', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.readyClip.id}/reactions`,
			params: { id: data.readyClip.id },
			body: { emoji: '❤️' },
			user: null,
			group: null
		});
		const res = await reactionsMod.POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for disallowed emoji', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.readyClip.id}/reactions`,
			params: { id: data.readyClip.id },
			body: { emoji: '🤡' },
			user: data.member,
			group: data.group
		});
		const res = await reactionsMod.POST(event as any);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toMatch(/invalid emoji/i);
	});

	it('adds reaction for valid emoji', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.readyClip.id}/reactions`,
			params: { id: data.readyClip.id },
			body: { emoji: '😂' },
			user: data.member,
			group: data.group
		});
		const res = await reactionsMod.POST(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.toggled).toBe(true);
		expect(body.reactions['😂']).toBeDefined();
		expect(body.reactions['😂'].count).toBe(1);
		expect(body.reactions['😂'].reacted).toBe(true);
	});

	it('toggles reaction off on second call', async () => {
		const event = createMockEvent({
			method: 'POST',
			path: `/api/clips/${data.readyClip.id}/reactions`,
			params: { id: data.readyClip.id },
			body: { emoji: '😂' },
			user: data.member,
			group: data.group
		});
		const res = await reactionsMod.POST(event as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.toggled).toBe(false);
		// Reaction count for this emoji should be 0 or the key absent
		if (body.reactions['😂']) {
			expect(body.reactions['😂'].count).toBe(0);
		}
	});
});
