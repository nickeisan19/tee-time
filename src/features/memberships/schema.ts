import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt, uuidPrimaryKey } from '../../db/columns';
import { users } from '../auth/schema';
import { MAX_BOOKING_WINDOW_DAYS, organizations } from '../organizations/schema';

export const MEMBERSHIP_STATUSES = ['pending', 'denied', 'active', 'suspended', 'cancelled'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

// Dates are club-local calendar dates stored as YYYY-MM-DD text.
const ISO_DATE_GLOB = sql.raw("'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'");

export const membershipTiers = sqliteTable(
	'membership_tiers',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		// How many days ahead members on this tier may book.
		bookingWindowDays: integer('booking_window_days').notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex('membership_tiers_org_name_uq').on(table.orgId, table.name),
		check('membership_tiers_window_check', sql`${table.bookingWindowDays} BETWEEN 0 AND ${sql.raw(String(MAX_BOOKING_WINDOW_DAYS))}`),
	],
);

// One row per golfer per club. A membership request starts as `pending`; staff approval makes it
// `active`. Whether it counts on a given day also depends on starts_on/ends_on (see standing.ts).
export const memberships = sqliteTable(
	'memberships',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		status: text('status', { enum: MEMBERSHIP_STATUSES }).notNull(),
		// NO ACTION (checked at end of statement): deleting a tier members hold is refused, but deleting the whole club still cascades.
		tierId: text('tier_id').references(() => membershipTiers.id, { onDelete: 'no action' }),
		requestedTierId: text('requested_tier_id').references(() => membershipTiers.id, { onDelete: 'set null' }),
		memberNumber: text('member_number'),
		startsOn: text('starts_on'),
		endsOn: text('ends_on'),
		requestNote: text('request_note'),
		decidedByUserId: text('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
		decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex('memberships_org_user_uq').on(table.orgId, table.userId),
		uniqueIndex('memberships_org_member_number_uq')
			.on(table.orgId, table.memberNumber)
			.where(sql`${table.memberNumber} IS NOT NULL`),
		index('memberships_org_status_idx').on(table.orgId, table.status),
		index('memberships_user_id_idx').on(table.userId),
		check('memberships_status_check', sql`${table.status} IN ('pending', 'denied', 'active', 'suspended', 'cancelled')`),
		// Approved memberships (and those later suspended or cancelled) always have a tier and start date.
		check(
			'memberships_terms_check',
			sql`${table.status} IN ('pending', 'denied') OR (${table.tierId} IS NOT NULL AND ${table.startsOn} IS NOT NULL)`,
		),
		check('memberships_starts_on_format', sql`${table.startsOn} IS NULL OR ${table.startsOn} GLOB ${ISO_DATE_GLOB}`),
		check('memberships_ends_on_format', sql`${table.endsOn} IS NULL OR ${table.endsOn} GLOB ${ISO_DATE_GLOB}`),
		check(
			'memberships_date_order_check',
			sql`${table.endsOn} IS NULL OR ${table.startsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`,
		),
	],
);

// Pending membership invites. Only a SHA-256 hash of the emailed token is stored.
// One pending invite per club and email; re-inviting replaces it.
export const membershipInvites = sqliteTable(
	'membership_invites',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		// Always stored lowercase.
		email: text('email').notNull(),
		tierId: text('tier_id')
			.notNull()
			.references(() => membershipTiers.id, { onDelete: 'cascade' }),
		memberNumber: text('member_number'),
		startsOn: text('starts_on').notNull(),
		endsOn: text('ends_on'),
		tokenHash: text('token_hash').notNull().unique(),
		invitedByUserId: text('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex('membership_invites_org_email_uq').on(table.orgId, table.email),
		check('membership_invites_starts_on_format', sql`${table.startsOn} GLOB ${ISO_DATE_GLOB}`),
		check('membership_invites_ends_on_format', sql`${table.endsOn} IS NULL OR ${table.endsOn} GLOB ${ISO_DATE_GLOB}`),
		check('membership_invites_date_order_check', sql`${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`),
	],
);

export const MEMBERSHIP_EVENT_ACTIONS = ['requested', 'approved', 'denied', 'updated', 'joined_by_invite'] as const;
export type MembershipEventAction = (typeof MEMBERSHIP_EVENT_ACTIONS)[number];

/** `{ field: { from, to } }` for each field an event changed. */
export type MembershipEventChanges = Record<string, { from: unknown; to: unknown }>;

// Append-only audit log of membership changes. Rows are written in the same transaction as the
// change they describe, and are never updated.
export const membershipEvents = sqliteTable(
	'membership_events',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		membershipId: text('membership_id')
			.notNull()
			.references(() => memberships.id, { onDelete: 'cascade' }),
		actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
		// Snapshot of who acted, kept even if their account is later renamed or deleted.
		actorName: text('actor_name'),
		actorEmail: text('actor_email'),
		action: text('action', { enum: MEMBERSHIP_EVENT_ACTIONS }).notNull(),
		changes: text('changes', { mode: 'json' }).$type<MembershipEventChanges>().notNull(),
		note: text('note'),
		createdAt: createdAt(),
	},
	(table) => [
		index('membership_events_org_created_idx').on(table.orgId, table.createdAt),
		index('membership_events_membership_created_idx').on(table.membershipId, table.createdAt),
		check(
			'membership_events_action_check',
			sql`${table.action} IN ('requested', 'approved', 'denied', 'updated', 'joined_by_invite')`,
		),
	],
);
