import { spawn } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { DATA_DIR } from '$lib/server/download-utils';
import { createLogger } from '$lib/server/logger';

const log = createLogger('waveform');
const PEAK_COUNT = 200;

export interface WaveformData {
	peaks: number[];
	durationSeconds: number;
}

export function waveformPath(clipId: string): string {
	return resolve(DATA_DIR, `${clipId}.waveform.json`);
}

/**
 * Generate waveform peak data from an audio file using FFmpeg.
 * Decodes to mono 8kHz 16-bit PCM, then computes RMS peaks per bin.
 * Saves result as JSON alongside the audio file.
 */
export async function generateWaveform(audioPath: string, clipId: string): Promise<WaveformData> {
	const t0 = performance.now();
	const ffmpeg = spawn('ffmpeg', [
		'-i',
		audioPath,
		'-ac',
		'1',
		'-ar',
		'8000',
		'-f',
		's16le',
		'-v',
		'quiet',
		'pipe:1'
	]);

	const chunks: Buffer[] = [];
	ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

	let stderr = '';
	ffmpeg.stderr.on('data', (chunk: Buffer) => {
		stderr += chunk.toString();
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		ffmpeg.on('close', resolve);
		ffmpeg.on('error', reject);
	});

	if (exitCode !== 0) {
		log.error({ exitCode, stderr: stderr.slice(0, 300), clipId }, 'FFmpeg waveform failed');
		throw new Error(`FFmpeg waveform generation failed with exit code ${exitCode}`);
	}

	const ffmpegMs = Math.round(performance.now() - t0);
	const pcm = Buffer.concat(chunks);
	const sampleCount = pcm.length / 2; // 16-bit = 2 bytes per sample
	const durationSeconds = sampleCount / 8000;
	const samplesPerPeak = Math.max(1, Math.floor(sampleCount / PEAK_COUNT));
	const actualPeakCount = Math.min(PEAK_COUNT, Math.ceil(sampleCount / samplesPerPeak));

	const peaks: number[] = [];
	let maxRms = 0;

	for (let i = 0; i < actualPeakCount; i++) {
		const start = i * samplesPerPeak;
		const end = Math.min(start + samplesPerPeak, sampleCount);
		let sumSquares = 0;
		for (let j = start; j < end; j++) {
			const sample = pcm.readInt16LE(j * 2);
			sumSquares += sample * sample;
		}
		const rms = Math.sqrt(sumSquares / (end - start));
		peaks.push(rms);
		if (rms > maxRms) maxRms = rms;
	}

	// Normalize to 0.0–1.0
	const normalized =
		maxRms > 0 ? peaks.map((p) => Math.round((p / maxRms) * 1000) / 1000) : peaks.map(() => 0);

	const data: WaveformData = {
		peaks: normalized,
		durationSeconds: Math.round(durationSeconds * 10) / 10
	};

	// eslint-disable-next-line security/detect-non-literal-fs-filename
	await writeFile(waveformPath(clipId), JSON.stringify(data));

	const totalMs = Math.round(performance.now() - t0);
	log.info(
		{ clipId, peaks: normalized.length, durationSeconds: data.durationSeconds, ffmpegMs, totalMs },
		'waveform generated'
	);
	return data;
}

export async function getWaveform(clipId: string): Promise<WaveformData | null> {
	try {
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		const raw = await readFile(waveformPath(clipId), 'utf-8');
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export async function deleteWaveform(clipId: string): Promise<void> {
	try {
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		await unlink(waveformPath(clipId));
	} catch {
		// Best effort
	}
}
