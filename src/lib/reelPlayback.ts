export function trackVideoTime(
	mediaEl: HTMLVideoElement | HTMLAudioElement,
	onUpdate: (currentTime: number, duration: number, paused: boolean) => void,
	onMetadata: (duration: number) => void,
	onWatchProgress: (percent: number) => void
): () => void {
	function handleTimeUpdate() {
		const d = mediaEl.duration || 0;
		onUpdate(mediaEl.currentTime, d, mediaEl.paused);
		if (d > 0) onWatchProgress((mediaEl.currentTime / d) * 100);
	}

	function handleLoadedMetadata() {
		onMetadata(mediaEl.duration || 0);
	}

	function handlePlayPause() {
		onUpdate(mediaEl.currentTime, mediaEl.duration || 0, mediaEl.paused);
	}

	mediaEl.addEventListener('timeupdate', handleTimeUpdate);
	mediaEl.addEventListener('loadedmetadata', handleLoadedMetadata);
	mediaEl.addEventListener('play', handlePlayPause);
	mediaEl.addEventListener('pause', handlePlayPause);

	if (mediaEl.duration) {
		onMetadata(mediaEl.duration);
		onUpdate(mediaEl.currentTime, mediaEl.duration, mediaEl.paused);
	}

	return () => {
		mediaEl.removeEventListener('timeupdate', handleTimeUpdate);
		mediaEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
		mediaEl.removeEventListener('play', handlePlayPause);
		mediaEl.removeEventListener('pause', handlePlayPause);
	};
}

export function sendWatchPercent(clipId: string, maxPercent: number): void {
	if (maxPercent <= 0) return;
	const pct = Math.round(maxPercent);
	const body = JSON.stringify({ watchPercent: pct });
	// Use PATCH to update percent without marking as watched (only swipe-past marks watched)
	fetch(`/api/clips/${clipId}/watched`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body,
		keepalive: true
	}).catch((err) => console.warn('[watch-percent]', err));
}

export function startPeriodicWatchUpdate(
	clipId: string,
	getMaxPercent: () => number,
	intervalMs = 5000
): () => void {
	const id = setInterval(() => {
		const pct = getMaxPercent();
		if (pct > 0) sendWatchPercent(clipId, pct);
	}, intervalMs);
	return () => clearInterval(id);
}

export function flashIndicator(
	setter: (visible: boolean) => void,
	currentTimer: ReturnType<typeof setTimeout> | null
): ReturnType<typeof setTimeout> {
	setter(true);
	if (currentTimer) clearTimeout(currentTimer);
	return setTimeout(() => setter(false), 800);
}
