CREATE TABLE `nines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`turn_minutes` integer DEFAULT 135 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "nines_turn_minutes_check" CHECK("nines"."turn_minutes" BETWEEN 30 AND 300)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nines_org_name_uq` ON `nines` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`nine_a_id` text NOT NULL,
	`nine_b_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`nine_a_id`) REFERENCES `nines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nine_b_id`) REFERENCES `nines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "routes_nine_order_check" CHECK("routes"."nine_a_id" < "routes"."nine_b_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routes_org_name_uq` ON `routes` (`org_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `routes_org_nines_uq` ON `routes` (`org_id`,`nine_a_id`,`nine_b_id`);--> statement-breakpoint
CREATE TABLE `tee_sheet_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`nine_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`first_tee_minute` integer NOT NULL,
	`last_tee_minute` integer NOT NULL,
	`interval_minutes` integer NOT NULL,
	`max_players` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`nine_id`) REFERENCES `nines`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tee_sheet_rules_day_check" CHECK("tee_sheet_rules"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "tee_sheet_rules_minutes_check" CHECK("tee_sheet_rules"."first_tee_minute" BETWEEN 0 AND 1439 AND "tee_sheet_rules"."last_tee_minute" BETWEEN "tee_sheet_rules"."first_tee_minute" AND 1439),
	CONSTRAINT "tee_sheet_rules_interval_check" CHECK("tee_sheet_rules"."interval_minutes" BETWEEN 1 AND 120),
	CONSTRAINT "tee_sheet_rules_players_check" CHECK("tee_sheet_rules"."max_players" BETWEEN 1 AND 6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tee_sheet_rules_nine_day_uq` ON `tee_sheet_rules` (`nine_id`,`day_of_week`);--> statement-breakpoint
CREATE TABLE `tee_times` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`nine_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`local_date` text NOT NULL,
	`local_time` text NOT NULL,
	`max_players` integer NOT NULL,
	`booked_players` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`members_only` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`nine_id`) REFERENCES `nines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tee_times_status_check" CHECK("tee_times"."status" IN ('open', 'blocked')),
	CONSTRAINT "tee_times_max_players_check" CHECK("tee_times"."max_players" BETWEEN 1 AND 6),
	CONSTRAINT "tee_times_capacity_check" CHECK("tee_times"."booked_players" BETWEEN 0 AND "tee_times"."max_players")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tee_times_nine_starts_uq` ON `tee_times` (`nine_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `tee_times_org_date_idx` ON `tee_times` (`org_id`,`local_date`,`local_time`);--> statement-breakpoint
CREATE TABLE `rates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`holes` integer NOT NULL,
	`audience` text NOT NULL,
	`tier_id` text,
	`tier_key` text GENERATED ALWAYS AS (coalesce(tier_id, '')) VIRTUAL,
	`day_type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tier_id`) REFERENCES `membership_tiers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rates_holes_check" CHECK("rates"."holes" IN (9, 18)),
	CONSTRAINT "rates_audience_check" CHECK("rates"."audience" IN ('member', 'member_guest', 'public')),
	CONSTRAINT "rates_day_type_check" CHECK("rates"."day_type" IN ('weekday', 'weekend')),
	CONSTRAINT "rates_tier_check" CHECK(("rates"."audience" = 'public') = ("rates"."tier_id" IS NULL)),
	CONSTRAINT "rates_amount_check" CHECK("rates"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rates_org_key_uq` ON `rates` (`org_id`,`holes`,`audience`,`tier_key`,`day_type`);