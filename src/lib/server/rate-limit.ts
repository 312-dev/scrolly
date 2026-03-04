import { json } from '@sveltejs/kit';

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
}

const enabled = process.env.RATE_LIMITING === 'true';

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 60 seconds (only when rate limiting is on)
if (enabled) {
	setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of store) {
			if (now >= entry.resetAt) {
				store.delete(key);
			}
		}
	}, 60_000);
}

export function checkRateLimit(
	key: string,
	config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
	if (!enabled) {
		return { allowed: true, remaining: config.maxRequests, resetAt: 0 };
	}

	const now = Date.now();
	const entry = store.get(key);

	if (!entry || now >= entry.resetAt) {
		const resetAt = now + config.windowMs;
		store.set(key, { count: 1, resetAt });
		return { allowed: true, remaining: config.maxRequests - 1, resetAt };
	}

	entry.count++;
	if (entry.count > config.maxRequests) {
		return { allowed: false, remaining: 0, resetAt: entry.resetAt };
	}

	return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

export function rateLimitResponse(resetAt: number) {
	const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
	return json(
		{ error: 'Too many requests. Please try again later.' },
		{
			status: 429,
			headers: {
				'Retry-After': String(retryAfter)
			}
		}
	);
}
