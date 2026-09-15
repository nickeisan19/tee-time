CREATE TABLE `staff_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "staff_invites_role_check" CHECK("staff_invites"."role" IN ('owner', 'admin', 'staff'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_invites_token_hash_unique` ON `staff_invites` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `staff_invites_org_email_uq` ON `staff_invites` (`org_id`,`email`);