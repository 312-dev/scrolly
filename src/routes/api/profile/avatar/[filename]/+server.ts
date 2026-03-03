import type { RequestHandler } from './$types';
import { resolve } from 'path';
import { readFile, stat } from 'fs/promises';
import { unauthorized, forbidden, notFound } from '$lib/server/api-utils';

const DATA_DIR = resolve(process.env.DATA_DIR || 'data', 'avatars');

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return unauthorized();
	}

	const filePath = resolve(DATA_DIR, params.filename);

	// Prevent directory traversal
	if (!filePath.startsWith(DATA_DIR)) {
		return forbidden();
	}

	try {
		await stat(filePath); // eslint-disable-line security/detect-non-literal-fs-filename
	} catch {
		return notFound();
	}

	const data = await readFile(filePath); // eslint-disable-line security/detect-non-literal-fs-filename
	return new Response(data, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'public, max-age=86400'
		}
	});
};
