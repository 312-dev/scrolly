CREATE TABLE `clip_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`clip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`position` integer NOT NULL,
	`scheduled_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clip_queue_user_group` ON `clip_queue` (`user_id`,`group_id`);--> statement-breakpoint
ALTER TABLE `groups` ADD `share_pacing_mode` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `share_burst` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `share_cooldown_minutes` integer DEFAULT 120 NOT NULL;--> statement-breakpoint
UPDATE `groups` SET `share_pacing_mode` = 'daily_cap' WHERE `daily_share_limit` IS NOT NULL;