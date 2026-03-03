import { spawn } from 'child_process';
import { readdir, readFile, unlink } from 'fs/promises';
import type {
	DownloadProvider,
	VideoDownloadResult,
	AudioDownloadResult,
	DownloadOptions
} from '../types';
import { getBinaryPath, isBinaryInstalled, downloadBinary, removeBinary } from '../binary';
import { getKnownProvider } from '../registry';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ytdlp');

const PROVIDER_ID = 'ytdlp';
const BINARY_NAME = 'yt-dlp';

/** Estimated average bytes-per-second for social media video (generous ~1.5 MB/s ≈ 12 Mbps) */
const VIDEO_BYTES_PER_SEC = 1.5 * 1024 * 1024;
/** Estimated average bytes-per-second for MP3 audio (generous ~100 KB/s ≈ 800 kbps) */
const AUDIO_BYTES_PER_SEC = 100 * 1024;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const MAX_CAPTION_LENGTH = 500;

/**
 * Extract the best caption/description from yt-dlp info.json metadata.
 * Prefers `description` (actual post caption on TikTok/IG/etc.) over `title`
 * (which is often generic like "Video by @username").
 */
export function extractCaption(info: Record<string, unknown>): string | null {
	const desc = typeof info.description === 'string' ? info.description.trim() : '';
	const title = typeof info.title === 'string' ? info.title.trim() : '';
	const fulltitle = typeof info.fulltitle === 'string' ? (info.fulltitle as string).trim() : '';
	const caption = desc || title || fulltitle || null;
	if (!caption) return null;
	return caption.length > MAX_CAPTION_LENGTH
		? caption.slice(0, MAX_CAPTION_LENGTH).trimEnd() + '…'
		: caption;
}

export class YtDlpProvider implements DownloadProvider {
	readonly id = PROVIDER_ID;
	readonly name = 'yt-dlp';
	readonly description = 'Community-maintained media downloader supporting 1000+ sites';
	readonly homepage = 'https://github.com/yt-dlp/yt-dlp';
	readonly capabilities: ('video' | 'music')[] = ['video', 'music'];

	private getBinaryCommand(): string {
		return getBinaryPath(PROVIDER_ID, BINARY_NAME);
	}

	async isInstalled(): Promise<boolean> {
		return isBinaryInstalled(PROVIDER_ID, BINARY_NAME);
	}

	async install(): Promise<void> {
		const known = getKnownProvider(PROVIDER_ID);
		if (!known) throw new Error('Unknown provider: ' + PROVIDER_ID);
		await downloadBinary(known, BINARY_NAME);
	}

	async uninstall(): Promise<void> {
		await removeBinary(PROVIDER_ID, BINARY_NAME);
	}

	async getVersion(): Promise<string | null> {
		if (!(await this.isInstalled())) return null;
		return new Promise((resolve) => {
			const proc = spawn(this.getBinaryCommand(), ['--version'], {
				stdio: ['ignore', 'pipe', 'pipe']
			});
			let stdout = '';
			proc.stdout.on('data', (d: Buffer) => {
				stdout += d.toString();
			});
			proc.on('close', () => resolve(stdout.trim() || null));
			proc.on('error', () => resolve(null));
		});
	}

	async downloadVideo(url: string, options: DownloadOptions): Promise<VideoDownloadResult> {
		return this.runVideoDownload(url, options);
	}

	async downloadAudio(searchQuery: string, options: DownloadOptions): Promise<AudioDownloadResult> {
		return this.runAudioDownloadWithRetries(searchQuery, options);
	}

	private runVideoDownload(url: string, options: DownloadOptions): Promise<VideoDownloadResult> {
		return new Promise((resolvePromise, reject) => {
			const outputTemplate = `${options.outputDir}/${options.clipId}.%(ext)s`;
			const binary = this.getBinaryCommand();

			const args = [
				'--no-playlist',
				'-f',
				'best[height<=1080]/best',
				'--write-thumbnail',
				'--convert-thumbnails',
				'jpg',
				'--write-info-json',
				'--js-runtimes',
				'node'
			];

			if (options.maxFileSizeBytes) {
				args.push('--max-filesize', String(options.maxFileSizeBytes));
				// Derive a generous duration estimate as a fast pre-filter
				const estimatedMaxDuration = Math.ceil(
					(options.maxFileSizeBytes / VIDEO_BYTES_PER_SEC) * 1.5
				);
				args.push('--match-filter', `duration <= ${estimatedMaxDuration}`);
			}

			args.push('-o', outputTemplate, url);

			const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
			let stderr = '';

			proc.stderr.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			proc.on('close', async (code) => {
				if (code !== 0) {
					reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
					return;
				}

				try {
					const result = await this.findVideoFiles(options.outputDir, options.clipId);
					resolvePromise(result);
				} catch (err) {
					reject(err);
				}
			});

			proc.on('error', (err) => {
				reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Is yt-dlp installed?`));
			});
		});
	}

	private async findVideoFiles(outputDir: string, clipId: string): Promise<VideoDownloadResult> {
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		const files = await readdir(outputDir);
		const clipFiles = files.filter((f) => f.startsWith(clipId));

		const videoFile = clipFiles.find(
			(f) => !f.endsWith('.jpg') && !f.endsWith('.json') && !f.endsWith('.part')
		);
		const thumbFile = clipFiles.find((f) => f.endsWith('.jpg'));
		const infoFile = clipFiles.find((f) => f.endsWith('.info.json'));

		if (!videoFile) {
			throw new Error(`No video file found for clip ${clipId}`);
		}

		let title: string | null = null;
		let duration: number | null = null;
		let creatorName: string | null = null;
		let creatorUrl: string | null = null;

		if (infoFile) {
			try {
				// eslint-disable-next-line security/detect-non-literal-fs-filename
				const info = JSON.parse(await readFile(`${outputDir}/${infoFile}`, 'utf-8'));
				title = extractCaption(info);
				duration = typeof info.duration === 'number' ? Math.round(info.duration) : null;

				const rawName = info.uploader || info.channel || info.uploader_id || null;
				creatorName = rawName ? String(rawName).replace(/^@/, '') : null;
				creatorUrl = info.uploader_url || info.channel_url || null;
			} catch {
				// Info file parsing is best-effort
			}
		}

		return {
			videoPath: `${outputDir}/${videoFile}`,
			thumbnailPath: thumbFile ? `${outputDir}/${thumbFile}` : null,
			title,
			duration,
			creatorName,
			creatorUrl
		};
	}

	private async runAudioDownloadWithRetries(
		searchQuery: string,
		options: DownloadOptions
	): Promise<AudioDownloadResult> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				return await this.runAudioDownload(searchQuery, options);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				if (attempt < MAX_RETRIES) {
					const delay = RETRY_DELAY_MS * attempt;
					log.warn(`yt-dlp attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms...`);
					await new Promise((r) => setTimeout(r, delay));
				}
			}
		}

		throw lastError ?? new Error('yt-dlp download failed');
	}

	/**
	 * Fetch metadata only (no video/audio download).
	 * Returns title, creator info extracted from yt-dlp's info.json.
	 */
	async fetchMetadata(
		url: string,
		outputDir: string,
		clipId: string
	): Promise<{ title: string | null; creatorName: string | null; creatorUrl: string | null }> {
		const binary = this.getBinaryCommand();
		const outputTemplate = `${outputDir}/${clipId}_meta.%(ext)s`;
		const args = [
			'--no-playlist',
			'--skip-download',
			'--write-info-json',
			'--js-runtimes',
			'node',
			'-o',
			outputTemplate,
			url
		];

		await new Promise<void>((resolve, reject) => {
			const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
			let stderr = '';
			proc.stderr.on('data', (d: Buffer) => {
				stderr += d.toString();
			});
			proc.on('close', (code) => {
				if (code !== 0) reject(new Error(`yt-dlp metadata fetch failed: ${stderr}`));
				else resolve();
			});
			proc.on('error', (err) => reject(err));
		});

		// eslint-disable-next-line security/detect-non-literal-fs-filename
		const files = await readdir(outputDir);
		const infoFile = files.find((f) => f.startsWith(`${clipId}_meta`) && f.endsWith('.info.json'));
		if (!infoFile) throw new Error('No info.json produced by metadata fetch');

		// eslint-disable-next-line security/detect-non-literal-fs-filename
		const info = JSON.parse(await readFile(`${outputDir}/${infoFile}`, 'utf-8'));
		const title = extractCaption(info);
		const rawName = info.uploader || info.channel || info.uploader_id || null;
		const creatorName = rawName ? String(rawName).replace(/^@/, '') : null;
		const creatorUrl = info.uploader_url || info.channel_url || null;

		// Clean up the temp info.json
		try {
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			await unlink(`${outputDir}/${infoFile}`);
		} catch {
			// best-effort cleanup
		}

		return { title, creatorName, creatorUrl };
	}

	private runAudioDownload(
		searchQuery: string,
		options: DownloadOptions
	): Promise<AudioDownloadResult> {
		return new Promise((resolvePromise, reject) => {
			const outputTemplate = `${options.outputDir}/${options.clipId}.%(ext)s`;
			const binary = this.getBinaryCommand();

			const args = [
				'--no-playlist',
				'--js-runtimes',
				'node',
				'--remote-components',
				'ejs:github',
				'--extractor-args',
				'youtube:player_client=android_vr,web_safari',
				'-x',
				'--audio-format',
				'mp3',
				'--audio-quality',
				'0',
				'--write-info-json'
			];

			if (options.maxFileSizeBytes) {
				args.push('--max-filesize', String(options.maxFileSizeBytes));
				const estimatedMaxDuration = Math.ceil(
					(options.maxFileSizeBytes / AUDIO_BYTES_PER_SEC) * 1.5
				);
				args.push('--match-filter', `duration <= ${estimatedMaxDuration}`);
			}

			args.push('-o', outputTemplate, searchQuery);

			// Strip Node/Vite env vars that interfere with yt-dlp's
			// internal `node --permission` subprocess for JS challenge solving
			const cleanEnv = { ...process.env };
			const stripPrefixes = ['NODE_OPTIONS', 'NODE_DEV', 'NODE_CHANNEL_FD', 'VITE_'];
			for (const key of Object.keys(cleanEnv)) {
				if (stripPrefixes.some((p) => key.startsWith(p))) {
					delete cleanEnv[key];
				}
			}

			const proc = spawn(binary, args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				env: cleanEnv
			});
			let stderr = '';
			let stdout = '';

			proc.stdout.on('data', (data: Buffer) => {
				stdout += data.toString();
			});
			proc.stderr.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			proc.on('close', async (code) => {
				if (code !== 0) {
					log.error({ stdout: stdout.slice(0, 500) }, 'yt-dlp audio failed');
					reject(new Error(`yt-dlp audio exited with code ${code}: ${stderr}`));
					return;
				}

				try {
					// eslint-disable-next-line security/detect-non-literal-fs-filename
					const files = await readdir(options.outputDir);
					const clipFiles = files.filter((f) => f.startsWith(options.clipId));
					const audioFile = clipFiles.find((f) => f.endsWith('.mp3'));
					const infoFile = clipFiles.find((f) => f.endsWith('.info.json'));

					if (!audioFile) {
						reject(new Error(`No audio file found for clip ${options.clipId}`));
						return;
					}

					let duration: number | null = null;
					if (infoFile) {
						try {
							const info = JSON.parse(
								// eslint-disable-next-line security/detect-non-literal-fs-filename
								await readFile(`${options.outputDir}/${infoFile}`, 'utf-8')
							);
							duration = typeof info.duration === 'number' ? Math.round(info.duration) : null;
						} catch {
							// Best-effort
						}
					}

					resolvePromise({
						audioPath: `${options.outputDir}/${audioFile}`,
						duration
					});
				} catch (err) {
					reject(err);
				}
			});

			proc.on('error', (err) => {
				reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Is yt-dlp installed?`));
			});
		});
	}
}
