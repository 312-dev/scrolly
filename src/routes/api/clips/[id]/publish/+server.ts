import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withClipAuth, badRequest, forbidden } from '$lib/server/api-utils';
import { publishMusicClip } from '$lib/server/music/publish';
import { deleteWaveform } from '$lib/server/audio/waveform';

export const POST: RequestHandler = withClipAuth(async ({ params }, { user, clip }) => {
	if (clip.addedBy !== user.id) {
		return forbidden('Only the uploader can publish');
	}

	if (clip.status !== 'pending_trim') {
		return badRequest('Clip is not awaiting trim');
	}

	const published = await publishMusicClip(params.id);
	if (!published) {
		return badRequest('Clip was already published');
	}

	await deleteWaveform(params.id);

	return json({ status: 'ready' });
});
