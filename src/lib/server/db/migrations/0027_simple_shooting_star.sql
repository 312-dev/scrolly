CREATE TABLE `dismissed_clips` (
	`clip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`dismissed_at` integer NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissed_clips_unique` ON `dismissed_clips` (`clip_id`,`user_id`);