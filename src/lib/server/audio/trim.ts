import { spawn } from 'child_process';
import { rename, unlink, stat } from 'fs/promises';
import { createLogger } from '$lib/server/logger';

const log = createLogger('trim');

export interface TrimResult {
	fileSizeBytes: number;
}

/**
 * Trim an MP3 file in-place using FFmpeg stream copy (no re-encoding).
 * Writes to a temp file, then replaces the original.
 */
export async function trimAudio(
	audioPath: string,
	startSeconds: number,
	endSeconds: number
): Promise<TrimResult> {
	const t0 = performance.now();
	const tempPath = audioPath.replace(/\.\w+$/, '.trimmed.mp3');

	const ffmpeg = spawn('ffmpeg', [
		'-y',
		'-i',
		audioPath,
		'-ss',
		String(startSeconds),
		'-to',
		String(endSeconds),
		'-c',
		'copy',
		tempPath
	]);

	let stderr = '';
	ffmpeg.stderr.on('data', (chunk: Buffer) => {
		stderr += chunk.toString();
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		ffmpeg.on('close', resolve);
		ffmpeg.on('error', reject);
	});

	if (exitCode !== 0) {
		log.error({ exitCode, stderr: stderr.slice(0, 500) }, 'FFmpeg trim failed');
		try {
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			await unlink(tempPath);
		} catch {
			/* best effort */
		}
		throw new Error(`FFmpeg trim failed with exit code ${exitCode}`);
	}

	// Replace original with trimmed version
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	await unlink(audioPath);
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	await rename(tempPath, audioPath);

	// eslint-disable-next-line security/detect-non-literal-fs-filename
	const s = await stat(audioPath);
	log.info(
		{
			audioPath,
			startSeconds,
			endSeconds,
			fileSizeBytes: s.size,
			durationMs: Math.round(performance.now() - t0)
		},
		'audio trimmed'
	);

	return { fileSizeBytes: s.size };
}
