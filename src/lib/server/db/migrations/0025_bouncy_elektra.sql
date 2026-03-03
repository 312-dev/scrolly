ALTER TABLE `users` ADD `last_legacy_share_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `used_new_share_flow` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE users SET last_legacy_share_at = unixepoch() WHERE id = (SELECT created_by FROM groups LIMIT 1);