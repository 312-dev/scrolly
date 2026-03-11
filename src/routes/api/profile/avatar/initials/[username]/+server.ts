import type { RequestHandler } from './$types';

/**
 * Deterministic color from a username string.
 * Picks from a palette that looks good on push notification backgrounds.
 */
const COLORS = [
	'#FF6B35', // coral
	'#A855F7', // violet
	'#22D3EE', // cyan
	'#FB7185', // rose
	'#FACC15', // gold
	'#34D399', // mint
	'#38BDF8', // sky
	'#E879F9', // fuchsia
	'#F97316', // orange
	'#6366F1' // indigo
];

function hashColor(username: string): string {
	let hash = 0;
	for (let i = 0; i < username.length; i++) {
		hash = username.charCodeAt(i) + ((hash << 5) - hash);
	}
	return COLORS[Math.abs(hash) % COLORS.length];
}

export const GET: RequestHandler = async ({ params }) => {
	const username = params.username;
	const initial = username.charAt(0).toUpperCase();
	const bg = hashColor(username);

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="64" fill="${bg}"/>
  <text x="64" y="64" dy="0.35em" text-anchor="middle"
    font-family="system-ui, -apple-system, sans-serif"
    font-size="56" font-weight="700" fill="#fff">${initial}</text>
</svg>`;

	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml',
			'Cache-Control': 'public, max-age=604800, immutable'
		}
	});
};
