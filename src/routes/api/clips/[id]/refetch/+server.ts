import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { clips } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireHost, requireClipInGroup, isResponse } from '$lib/server/api-utils';
import { getActiveProvider } from '$lib/server/providers/registry';
import { DATA_DIR } from '$lib/server/download-utils';
import { YtDlpProvider } from '$lib/server/providers/ytdlp';
import { createLogger } from '$lib/server/logger';

const log = createLogger('refetch');

export const POST: RequestHandler = async ({ params, locals }) => {
	const hostError = requireHost(locals);
	if (hostError) return hostError;

	const clipOrError = await requireClipInGroup(params.id, locals.user!.groupId);
	if (isResponse(clipOrError)) return clipOrError;

	const clip = clipOrError;

	// Only refetch for clips that have a source URL
	if (!clip.originalUrl) {
		return json({ error: 'No source URL to refetch from' }, { status: 400 });
	}

	// Must have a provider installed
	const provider = await getActiveProvider(locals.user!.groupId);
	if (!provider || !(provider instanceof YtDlpProvider)) {
		return json({ error: 'No compatible download provider configured' }, { status: 400 });
	}

	try {
		const metadata = await provider.fetchMetadata(clip.originalUrl, DATA_DIR, clip.id);

		const updates: Record<string, unknown> = {};
		if (metadata.title) updates.title = metadata.title;
		if (metadata.creatorName) updates.creatorName = metadata.creatorName;
		if (metadata.creatorUrl) updates.creatorUrl = metadata.creatorUrl;
		if (metadata.sourceViewCount !== null && metadata.sourceViewCount !== undefined)
			updates.sourceViewCount = metadata.sourceViewCount;

		if (Object.keys(updates).length > 0) {
			await db.update(clips).set(updates).where(eq(clips.id, clip.id));
		}

		return json({
			title: metadata.title ?? clip.title,
			creatorName: metadata.creatorName ?? clip.creatorName,
			creatorUrl: metadata.creatorUrl ?? clip.creatorUrl,
			sourceViewCount: metadata.sourceViewCount ?? clip.sourceViewCount
		});
	} catch (err) {
		log.error({ err, clipId: clip.id }, 'metadata refetch failed');
		return json({ error: 'Failed to refetch metadata' }, { status: 500 });
	}
};
