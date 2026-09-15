CREATE TABLE `membership_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`actor_user_id` text,
	`actor_name` text,
	`actor_email` text,
	`action` text NOT NULL,
	`changes` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "membership_events_action_check" CHECK("membership_events"."action" IN ('requested', 'approved', 'denied', 'updated', 'joined_by_invite'))
);
--> statement-breakpoint
CREATE INDEX `membership_events_org_created_idx` ON `membership_events` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `membership_events_membership_created_idx` ON `membership_events` (`membership_id`,`created_at`);