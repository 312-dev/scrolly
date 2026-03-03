import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withClipAuth } from '$lib/server/api-utils';
import { getWaveform } from '$lib/server/audio/waveform';

export const GET: RequestHandler = withClipAuth(async ({ params }, { clip }) => {
	if (clip.contentType !== 'music') {
		return json({ error: 'Not a music clip' }, { status: 400 });
	}

	const waveform = await getWaveform(params.id);
	if (!waveform) {
		return json({ error: 'Waveform not available' }, { status: 404 });
	}

	return json(waveform);
});
