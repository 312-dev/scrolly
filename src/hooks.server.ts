import type { Handle, RequestEvent } from '@sveltejs/kit';
import { getUserIdFromCookies, getUserWithGroup, getDefaultGroup } from '$lib/server/auth';
import { getAccentColor } from '$lib/colors';
import { startScheduler } from '$lib/server/scheduler';
import { createLogger } from '$lib/server/logger';
import { checkRateLimit, rateLimitResponse } from '$lib/server/rate-limit';

const log = createLogger('http');

startScheduler();

function applyRateLimit(event: RequestEvent): Response | null {
	const path = new URL(event.request.url).pathname;
	const method = event.request.method;

	if (!path.startsWith('/api/') || path === '/api/health') return null;

	const ip = event.getClientAddress();

	// Stricter limit on auth endpoints
	if (path === '/api/auth' && method === 'POST') {
		const result = checkRateLimit(`auth:${ip}`, { windowMs: 15 * 60 * 1000, maxRequests: 10 });
		if (!result.allowed) {
			log.warn({ ip, path }, 'auth rate limit exceeded');
			return rateLimitResponse(result.resetAt);
		}
	}

	// Stricter limit on share endpoint (triggers downloads)
	if (path.startsWith('/api/clips/share') && method === 'POST') {
		const result = checkRateLimit(`share:${ip}`, { windowMs: 60 * 1000, maxRequests: 10 });
		if (!result.allowed) {
			log.warn({ ip, path }, 'share rate limit exceeded');
			return rateLimitResponse(result.resetAt);
		}
	}

	// Global API rate limit
	const result = checkRateLimit(`api:${ip}`, { windowMs: 60 * 1000, maxRequests: 120 });
	if (!result.allowed) {
		log.warn({ ip, path }, 'global API rate limit exceeded');
		return rateLimitResponse(result.resetAt);
	}

	return null;
}

function setSecurityHeaders(response: Response): void {
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline'",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
			"font-src 'self' https://fonts.gstatic.com",
			"img-src 'self' blob: data: https://i.scdn.co https://*.giphy.com",
			"media-src 'self' blob:",
			"connect-src 'self'",
			"frame-ancestors 'none'"
		].join('; ')
	);
}

function setThemeCookies(event: RequestEvent, response: Response): void {
	const cookies = event.request.headers.get('cookie') || '';

	if (event.locals.user?.themePreference && !cookies.includes('scrolly_theme=')) {
		response.headers.append(
			'Set-Cookie',
			`scrolly_theme=${event.locals.user.themePreference};Path=/;Max-Age=31536000;SameSite=Lax;Secure`
		);
	}

	if (event.locals.group?.accentColor) {
		const accent = getAccentColor(event.locals.group.accentColor);
		const accentValue = encodeURIComponent(JSON.stringify({ hex: accent.hex, dark: accent.dark }));
		response.headers.append(
			'Set-Cookie',
			`scrolly_accent=${accentValue};Path=/;Max-Age=31536000;SameSite=Lax;Secure`
		);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const start = Date.now();
	const path = new URL(event.request.url).pathname;

	// Rate limiting (runs before session resolution to save DB queries)
	const rateLimited = applyRateLimit(event);
	if (rateLimited) return rateLimited;

	const userId = getUserIdFromCookies(event.request.headers.get('cookie'));

	if (userId) {
		const data = await getUserWithGroup(userId);
		if (data && !data.user.removedAt) {
			// Only expose authenticated user to routes if onboarding is complete.
			// Users with empty username haven't finished onboarding and should not
			// have access to group data via API routes. The /api/auth onboarding
			// actions read the cookie directly via getUserIdFromCookies, so they
			// still work without locals.user.
			if (data.user.username) {
				event.locals.user = data.user;
			}
			event.locals.group = data.group;
		}
	}

	// For unauthenticated requests, still resolve the group so accent color,
	// dynamic icons, and PWA branding work on /join, /onboard, etc.
	if (!event.locals.group) {
		event.locals.group = await getDefaultGroup();
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			const theme = event.locals.user?.themePreference;
			const accent = getAccentColor(event.locals.group?.accentColor);

			let attrs = '';
			if (theme && theme !== 'system') {
				attrs += ` data-theme="${theme}"`;
			}
			attrs += ` style="--accent-primary:${accent.hex};--accent-primary-dark:${accent.dark}"`;

			return html.replace('<html lang="en">', `<html lang="en"${attrs}>`);
		}
	});

	setSecurityHeaders(response);
	setThemeCookies(event, response);

	// Request logging (skip static assets and health checks)
	if (!path.startsWith('/_app/') && path !== '/api/health') {
		const duration = Date.now() - start;
		log.info(
			{
				method: event.request.method,
				path,
				status: response.status,
				duration,
				userId: event.locals.user?.id
			},
			`${event.request.method} ${path} ${response.status} ${duration}ms`
		);
	}

	return response;
};
