import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { clips, users, notificationPreferences, notifications } from '$lib/server/db/schema';
import { eq, and, inArray, type InferSelectModel } from 'drizzle-orm';
import { sendNotification } from '$lib/server/push';
import { env } from '$env/dynamic/private';
import { v4 as uuid } from 'uuid';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api-utils');

// ── Types ──────────────────────────────────────────────────────────────

export type Clip = InferSelectModel<typeof clips>;

/** Guaranteed non-null auth context passed to wrapped handlers. */
export interface AuthContext {
	user: NonNullable<App.Locals['user']>;
	group: NonNullable<App.Locals['group']>;
}

/** Auth context with a validated clip. */
export interface ClipAuthContext extends AuthContext {
	clip: Clip;
}

// ── Auth guards (original — still used internally) ─────────────────────

/**
 * Returns a JSON 401 response if user is not authenticated or has no group.
 * Returns null if auth is valid.
 */
export function requireAuth(locals: App.Locals): Response | null {
	if (!locals.user) return json({ error: 'Not authenticated' }, { status: 401 });
	if (!locals.group) return json({ error: 'No group' }, { status: 401 });
	return null;
}

/**
 * Returns a JSON 403 response if user is not the group host.
 * Also checks auth first.
 */
export function requireHost(locals: App.Locals): Response | null {
	const authError = requireAuth(locals);
	if (authError) return authError;
	if (locals.group!.createdBy !== locals.user!.id) {
		return json({ error: 'Only the host can do this' }, { status: 403 });
	}
	return null;
}

/**
 * Verify a clip belongs to the user's group.
 * Returns the clip or a 404 error response.
 */
export async function requireClipInGroup(
	clipId: string,
	groupId: string
): Promise<Response | Clip> {
	const clip = await db.query.clips.findFirst({
		where: and(eq(clips.id, clipId), eq(clips.groupId, groupId))
	});
	if (!clip) return json({ error: 'Clip not found' }, { status: 404 });
	return clip;
}

// ── Handler wrappers ───────────────────────────────────────────────────

/** Wrap a handler with auth check. Passes guaranteed { user, group }. */
export function withAuth<P extends Record<string, string> = Record<string, string>>(
	handler: (event: RequestEvent<P>, auth: AuthContext) => Promise<Response> | Response
): (event: RequestEvent<P>) => Promise<Response> {
	return async (event) => {
		const authError = requireAuth(event.locals);
		if (authError) return authError;
		return handler(event, {
			user: event.locals.user!,
			group: event.locals.group!
		});
	};
}

/** Wrap a handler with auth + clip-in-group check. Expects params.id as clip ID. */
export function withClipAuth<P extends { id: string } = { id: string }>(
	handler: (event: RequestEvent<P>, auth: ClipAuthContext) => Promise<Response> | Response
): (event: RequestEvent<P>) => Promise<Response> {
	return async (event) => {
		const authError = requireAuth(event.locals);
		if (authError) return authError;
		const clipOrError = await requireClipInGroup(event.params.id, event.locals.user!.groupId);
		if (isResponse(clipOrError)) return clipOrError;
		return handler(event, {
			user: event.locals.user!,
			group: event.locals.group!,
			clip: clipOrError
		});
	};
}

/** Wrap a handler with host auth check (auth + must be group creator). */
export function withHost<P extends Record<string, string> = Record<string, string>>(
	handler: (event: RequestEvent<P>, auth: AuthContext) => Promise<Response> | Response
): (event: RequestEvent<P>) => Promise<Response> {
	return async (event) => {
		const hostError = requireHost(event.locals);
		if (hostError) return hostError;
		return handler(event, {
			user: event.locals.user!,
			group: event.locals.group!
		});
	};
}

// ── Body parsing ───────────────────────────────────────────────────────

/**
 * Safely parse JSON body, returns parsed data or a 400 response.
 */
export async function parseBody<T = Record<string, unknown>>(
	request: Request
): Promise<T | Response> {
	try {
		return (await request.json()) as T;
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
}

/**
 * Type guard for parseBody results — checks if the value is a Response.
 */
export function isResponse(value: unknown): value is Response {
	return value instanceof Response;
}

// ── Error response builders ────────────────────────────────────────────

export function unauthorized(message = 'Not authenticated') {
	return json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
	return json({ error: message }, { status: 403 });
}

export function notFound(message = 'Not found') {
	return json({ error: message }, { status: 404 });
}

export function badRequest(message: string) {
	return json({ error: message }, { status: 400 });
}

export function conflict(message: string) {
	return json({ error: message }, { status: 409 });
}

// ── Query helpers ──────────────────────────────────────────────────────

/**
 * Batch-fetch users by ID, returning a Map of userId → { username, avatarPath }.
 * Deduplicates IDs automatically.
 */
export async function mapUsersByIds(
	ids: string[]
): Promise<Map<string, { username: string; avatarPath: string | null }>> {
	const map = new Map<string, { username: string; avatarPath: string | null }>();
	if (ids.length === 0) return map;
	const deduped = [...new Set(ids)];
	const rows = await db.query.users.findMany({
		where: inArray(users.id, deduped)
	});
	for (const u of rows) {
		map.set(u.id, { username: u.username, avatarPath: u.avatarPath });
	}
	return map;
}

/**
 * Parse a query parameter as a non-negative integer with a default.
 * Returns defaultValue for NaN, negative, or missing values.
 */
export function safeInt(value: string | null, defaultValue: number, max?: number): number {
	const n = parseInt(value || '', 10);
	if (isNaN(n) || n < 0) return defaultValue;
	return max !== undefined ? Math.min(n, max) : n;
}

// ── Notification helpers ───────────────────────────────────────────────

/**
 * Notify a user about a clip interaction (reaction, comment, reply).
 * Checks notification preferences, sends push, and inserts in-app notification.
 * No-ops if recipientId === actorId (don't notify self).
 */
export async function notifyClipOwner(opts: {
	recipientId: string;
	actorId: string;
	actorUsername: string;
	actorAvatarPath?: string | null;
	clipId: string;
	type: 'reaction' | 'comment' | 'reply';
	preferenceKey: 'reactions' | 'comments';
	pushTitle: string;
	pushBody: string;
	pushTag: string;
	emoji?: string;
	commentPreview?: string;
}): Promise<void> {
	if (opts.recipientId === opts.actorId) return;

	const prefs = await db.query.notificationPreferences.findFirst({
		where: eq(notificationPreferences.userId, opts.recipientId)
	});
	const prefEnabled = !prefs || prefs[opts.preferenceKey];
	if (prefEnabled) {
		const url =
			opts.type === 'comment' || opts.type === 'reply'
				? `/?clip=${opts.clipId}&comments=true`
				: `/?clip=${opts.clipId}`;
		let image: string | undefined;
		if (env.ORIGIN) {
			image = opts.actorAvatarPath
				? `${env.ORIGIN}/api/profile/avatar/${opts.actorAvatarPath}`
				: `${env.ORIGIN}/api/profile/avatar/initials/${encodeURIComponent(opts.actorUsername)}`;
		}
		sendNotification(opts.recipientId, {
			title: opts.pushTitle,
			body: opts.pushBody,
			url,
			tag: opts.pushTag,
			...(image ? { image } : {})
		}).catch((err) => log.error({ err }, 'push notification failed'));
	}

	const notifId = uuid();
	await db.insert(notifications).values({
		id: notifId,
		userId: opts.recipientId,
		type: opts.type,
		clipId: opts.clipId,
		actorId: opts.actorId,
		emoji: opts.emoji ?? null,
		commentPreview: opts.commentPreview ?? null,
		createdAt: new Date()
	});
}

// ── Reaction grouping ──────────────────────────────────────────────────

export interface ReactionData {
	count: number;
	reacted: boolean;
}

/**
 * Group reactions by emoji for a single clip, returning whether the given user reacted.
 */
export function groupReactions(
	reactionRows: { emoji: string; userId: string }[],
	userId: string
): Record<string, ReactionData> {
	const grouped: Record<string, ReactionData> = {};
	for (const r of reactionRows) {
		if (!grouped[r.emoji]) {
			grouped[r.emoji] = { count: 0, reacted: false };
		}
		grouped[r.emoji].count++;
		if (r.userId === userId) {
			grouped[r.emoji].reacted = true;
		}
	}
	return grouped;
}

/**
 * Group reactions by clip ID, returning a map of clipId -> emoji -> ReactionData.
 */
export function groupReactionsByClip(
	reactionRows: { clipId: string; emoji: string; userId: string }[],
	userId: string
): Map<string, Record<string, ReactionData>> {
	const map = new Map<string, Record<string, ReactionData>>();
	for (const r of reactionRows) {
		if (!map.has(r.clipId)) map.set(r.clipId, {});
		const group = map.get(r.clipId)!;
		if (!group[r.emoji]) group[r.emoji] = { count: 0, reacted: false };
		group[r.emoji].count++;
		if (r.userId === userId) group[r.emoji].reacted = true;
	}
	return map;
}
