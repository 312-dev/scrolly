import type { groups, users } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

declare global {
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			user: InferSelectModel<typeof users> | null;
			group: InferSelectModel<typeof groups> | null;
		}
		interface PageState {
			sheet?: string;
			clipOverlay?: string;
		}
	}
}

export {};
