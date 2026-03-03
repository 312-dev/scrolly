export interface VideoDownloadResult {
	videoPath: string;
	thumbnailPath: string | null;
	title: string | null;
	duration: number | null;
	creatorName: string | null;
	creatorUrl: string | null;
}

export interface AudioDownloadResult {
	audioPath: string;
	duration: number | null;
}

export interface DownloadOptions {
	outputDir: string;
	clipId: string;
	maxFileSizeBytes: number | null;
}

export interface DownloadProvider {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly homepage: string;
	readonly capabilities: ('video' | 'music')[];

	isInstalled(): Promise<boolean>;
	install(): Promise<void>;
	uninstall(): Promise<void>;
	getVersion(): Promise<string | null>;

	downloadVideo(url: string, options: DownloadOptions): Promise<VideoDownloadResult>;
	downloadAudio(searchQuery: string, options: DownloadOptions): Promise<AudioDownloadResult>;
}

export interface KnownProvider {
	id: string;
	name: string;
	description: string;
	homepage: string;
	license: string;
	capabilities: ('video' | 'music')[];
	binaryUrl: string;
	dependencies: string[];
}
