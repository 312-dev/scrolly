import { resolve } from 'path';
import { readdir, stat, unlink } from 'fs/promises';
import { db } from './db';
import { clips, groups } from './db/schema';
import { eq } from 'drizzle-orm';

export const DATA_DIR = resolve(process.env.DATA_DIR || 'data', 'videos');

/**
 * Look up the group's max file size setting for a given clip.
 * Returns the limit in bytes, or null if no limit is configured.
 */
export async function getMaxFileSize(clipId: string): Promise<number | null> {
	const row = db
		.select({ maxFileSizeMb: groups.maxFileSizeMb })
		.from(clips)
		.innerJoin(groups, eq(clips.groupId, groups.id))
		.where(eq(clips.id, clipId))
		.get();
	if (row?.maxFileSizeMb === null || row?.maxFileSizeMb === undefined) return null;
	return row.maxFileSizeMb * 1024 * 1024;
}

/**
 * Fetch a clip and its group's max file size in a single query.
 * Used by download pipelines that need both the clip record and the size limit.
 */
export function getClipWithMaxFileSize(clipId: string) {
	const row = db
		.select({ clip: clips, maxFileSizeMb: groups.maxFileSizeMb })
		.from(clips)
		.innerJoin(groups, eq(clips.groupId, groups.id))
		.where(eq(clips.id, clipId))
		.get();
	if (!row) return null;
	const maxFileSizeBytes =
		row.maxFileSizeMb !== null && row.maxFileSizeMb !== undefined
			? row.maxFileSizeMb * 1024 * 1024
			: null;
	return { clip: row.clip, maxFileSizeBytes };
}

/**
 * Remove all files in DATA_DIR that start with the given clipId.
 * Best-effort — silently ignores missing files or directories.
 */
export async function cleanupClipFiles(clipId: string): Promise<void> {
	try {
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		const files = await readdir(DATA_DIR);
		for (const f of files.filter((f) => f.startsWith(clipId))) {
			try {
				// eslint-disable-next-line security/detect-non-literal-fs-filename
				await unlink(`${DATA_DIR}/${f}`);
			} catch {
				// Best-effort cleanup
			}
		}
	} catch {
		// DATA_DIR may not exist yet
	}
}

/**
 * Sum the file sizes of the given paths (skipping nulls and missing files).
 */
export async function totalFileSize(paths: (string | null)[]): Promise<number> {
	let total = 0;
	for (const path of paths) {
		if (path) {
			try {
				// eslint-disable-next-line security/detect-non-literal-fs-filename
				const s = await stat(path);
				total += s.size;
			} catch {
				// File may not exist
			}
		}
	}
	return total;
}
