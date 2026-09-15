CREATE TABLE `booking_players` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`position` integer NOT NULL,
	`user_id` text,
	`guest_name` text,
	`rate_audience` text NOT NULL,
	`rate_cents` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "booking_players_identity_check" CHECK("booking_players"."user_id" IS NOT NULL OR "booking_players"."guest_name" IS NOT NULL),
	CONSTRAINT "booking_players_audience_check" CHECK("booking_players"."rate_audience" IN ('member', 'member_guest', 'public')),
	CONSTRAINT "booking_players_rate_check" CHECK("booking_players"."rate_cents" IS NULL OR "booking_players"."rate_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `booking_players_booking_idx` ON `booking_players` (`booking_id`,`position`);--> statement-breakpoint
CREATE TABLE `booking_tee_times` (
	`booking_id` text NOT NULL,
	`tee_time_id` text NOT NULL,
	`leg` integer NOT NULL,
	PRIMARY KEY(`booking_id`, `leg`),
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tee_time_id`) REFERENCES `tee_times`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "booking_tee_times_leg_check" CHECK("booking_tee_times"."leg" IN (1, 2))
);
--> statement-breakpoint
CREATE INDEX `booking_tee_times_tee_time_idx` ON `booking_tee_times` (`tee_time_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`booked_by_user_id` text NOT NULL,
	`holes` integer NOT NULL,
	`route_id` text,
	`start_nine_id` text NOT NULL,
	`player_count` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`total_cents` integer,
	`cancelled_at` integer,
	`cancelled_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`start_nine_id`) REFERENCES `nines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bookings_holes_check" CHECK(("bookings"."holes" = 9 AND "bookings"."route_id" IS NULL) OR ("bookings"."holes" = 18 AND "bookings"."route_id" IS NOT NULL)),
	CONSTRAINT "bookings_player_count_check" CHECK("bookings"."player_count" BETWEEN 1 AND 6),
	CONSTRAINT "bookings_status_check" CHECK("bookings"."status" IN ('confirmed', 'cancelled', 'checked_in', 'no_show')),
	CONSTRAINT "bookings_payment_status_check" CHECK("bookings"."payment_status" IN ('unpaid', 'paid', 'waived')),
	CONSTRAINT "bookings_total_check" CHECK("bookings"."total_cents" IS NULL OR "bookings"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bookings_org_created_idx` ON `bookings` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bookings_booked_by_idx` ON `bookings` (`booked_by_user_id`);