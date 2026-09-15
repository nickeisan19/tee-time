CREATE TABLE `membership_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`tier_id` text NOT NULL,
	`member_number` text,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tier_id`) REFERENCES `membership_tiers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "membership_invites_starts_on_format" CHECK("membership_invites"."starts_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "membership_invites_ends_on_format" CHECK("membership_invites"."ends_on" IS NULL OR "membership_invites"."ends_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "membership_invites_date_order_check" CHECK("membership_invites"."ends_on" IS NULL OR "membership_invites"."ends_on" >= "membership_invites"."starts_on")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_invites_token_hash_unique` ON `membership_invites` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_invites_org_email_uq` ON `membership_invites` (`org_id`,`email`);--> statement-breakpoint
CREATE TABLE `membership_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`booking_window_days` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "membership_tiers_window_check" CHECK("membership_tiers"."booking_window_days" BETWEEN 0 AND 365)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_tiers_org_name_uq` ON `membership_tiers` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`tier_id` text,
	`requested_tier_id` text,
	`member_number` text,
	`starts_on` text,
	`ends_on` text,
	`request_note` text,
	`decided_by_user_id` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tier_id`) REFERENCES `membership_tiers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_tier_id`) REFERENCES `membership_tiers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "memberships_status_check" CHECK("memberships"."status" IN ('pending', 'denied', 'active', 'suspended', 'cancelled')),
	CONSTRAINT "memberships_terms_check" CHECK("memberships"."status" IN ('pending', 'denied') OR ("memberships"."tier_id" IS NOT NULL AND "memberships"."starts_on" IS NOT NULL)),
	CONSTRAINT "memberships_starts_on_format" CHECK("memberships"."starts_on" IS NULL OR "memberships"."starts_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "memberships_ends_on_format" CHECK("memberships"."ends_on" IS NULL OR "memberships"."ends_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "memberships_date_order_check" CHECK("memberships"."ends_on" IS NULL OR "memberships"."starts_on" IS NULL OR "memberships"."ends_on" >= "memberships"."starts_on")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user_uq` ON `memberships` (`org_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_member_number_uq` ON `memberships` (`org_id`,`member_number`) WHERE "memberships"."member_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `memberships_org_status_idx` ON `memberships` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `memberships_user_id_idx` ON `memberships` (`user_id`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `public_booking_window_days` integer DEFAULT 7 NOT NULL;