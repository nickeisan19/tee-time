import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt, uuidPrimaryKey } from '../../db/columns';
import { users } from '../auth/schema';
import { nines, routes } from '../courses/schema';
import { organizations } from '../organizations/schema';
import { teeTimes } from '../tee-sheet/schema';

export const BOOKING_STATUSES = ['confirmed', 'cancelled', 'checked_in', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Paid at the pro shop, so there is no online payment state. */
export const PAYMENT_STATUSES = ['unpaid', 'paid', 'waived'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PLAYER_RATE_AUDIENCES = ['member', 'member_guest', 'public'] as const;

// A 9-hole booking holds one tee time; an 18-hole booking holds a start and a crossover tee time.
export const bookings = sqliteTable(
	'bookings',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		bookedByUserId: text('booked_by_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		holes: integer('holes').notNull(),
		routeId: text('route_id').references(() => routes.id, { onDelete: 'no action' }),
		startNineId: text('start_nine_id')
			.notNull()
			.references(() => nines.id, { onDelete: 'no action' }),
		playerCount: integer('player_count').notNull(),
		status: text('status', { enum: BOOKING_STATUSES }).notNull().default('confirmed'),
		paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).notNull().default('unpaid'),
		// Sum of player prices when every player has one; null if any price wasn't set by the club.
		totalCents: integer('total_cents'),
		cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
		cancelledByUserId: text('cancelled_by_user_id').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index('bookings_org_created_idx').on(table.orgId, table.createdAt),
		index('bookings_booked_by_idx').on(table.bookedByUserId),
		check(
			'bookings_holes_check',
			sql`(${table.holes} = 9 AND ${table.routeId} IS NULL) OR (${table.holes} = 18 AND ${table.routeId} IS NOT NULL)`,
		),
		check('bookings_player_count_check', sql`${table.playerCount} BETWEEN 1 AND 6`),
		check('bookings_status_check', sql`${table.status} IN ('confirmed', 'cancelled', 'checked_in', 'no_show')`),
		check('bookings_payment_status_check', sql`${table.paymentStatus} IN ('unpaid', 'paid', 'waived')`),
		check('bookings_total_check', sql`${table.totalCents} IS NULL OR ${table.totalCents} >= 0`),
	],
);

// The tee times a booking holds: leg 1 is the start, leg 2 the 18-hole crossover.
export const bookingTeeTimes = sqliteTable(
	'booking_tee_times',
	{
		bookingId: text('booking_id')
			.notNull()
			.references(() => bookings.id, { onDelete: 'cascade' }),
		teeTimeId: text('tee_time_id')
			.notNull()
			.references(() => teeTimes.id, { onDelete: 'no action' }),
		leg: integer('leg').notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.bookingId, table.leg] }),
		index('booking_tee_times_tee_time_idx').on(table.teeTimeId),
		check('booking_tee_times_leg_check', sql`${table.leg} IN (1, 2)`),
	],
);

// Everyone in the group, with the price they were quoted when the booking was made.
export const bookingPlayers = sqliteTable(
	'booking_players',
	{
		id: uuidPrimaryKey(),
		bookingId: text('booking_id')
			.notNull()
			.references(() => bookings.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		// The booker (position 1) is linked to their account; guests are named.
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		guestName: text('guest_name'),
		rateAudience: text('rate_audience', { enum: PLAYER_RATE_AUDIENCES }).notNull(),
		rateCents: integer('rate_cents'),
		createdAt: createdAt(),
	},
	(table) => [
		index('booking_players_booking_idx').on(table.bookingId, table.position),
		check('booking_players_identity_check', sql`${table.userId} IS NOT NULL OR ${table.guestName} IS NOT NULL`),
		check('booking_players_audience_check', sql`${table.rateAudience} IN ('member', 'member_guest', 'public')`),
		check('booking_players_rate_check', sql`${table.rateCents} IS NULL OR ${table.rateCents} >= 0`),
	],
);
