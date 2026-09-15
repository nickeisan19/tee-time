import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt, uuidPrimaryKey } from '../../db/columns';
import { users } from '../auth/schema';

export const DEFAULT_PUBLIC_BOOKING_WINDOW_DAYS = 7;
export const MAX_BOOKING_WINDOW_DAYS = 365;
export const DEFAULT_CANCELLATION_CUTOFF_HOURS = 24;
export const MAX_CANCELLATION_CUTOFF_HOURS = 168;

export const STAFF_ROLES = ['owner', 'admin', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// One row per golf club (the tenant).
export const organizations = sqliteTable('organizations', {
	id: uuidPrimaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	// IANA timezone, e.g. "America/Chicago". Tee sheets are generated in club-local time.
	timezone: text('timezone').notNull(),
	// How many days ahead non-members may book. Members use their tier's window instead.
	publicBookingWindowDays: integer('public_booking_window_days').notNull().default(DEFAULT_PUBLIC_BOOKING_WINDOW_DAYS),
	// Golfers can cancel their own bookings until this many hours before the tee time; staff anytime.
	cancellationCutoffHours: integer('cancellation_cutoff_hours').notNull().default(DEFAULT_CANCELLATION_CUTOFF_HOURS),
	// Set when a logo is stored in R2 (key `logos/<org id>`); also versions the public logo URL.
	logoUpdatedAt: integer('logo_updated_at', { mode: 'timestamp_ms' }),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

// Club staff (people who run the club). Golf memberships are a separate table.
export const orgStaff = sqliteTable(
	'org_staff',
	{
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role', { enum: STAFF_ROLES }).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		primaryKey({ columns: [table.orgId, table.userId] }),
		index('org_staff_user_id_idx').on(table.userId),
		check('org_staff_role_check', sql`${table.role} IN ('owner', 'admin', 'staff')`),
	],
);

// Pending staff invites. Only a SHA-256 hash of the emailed token is stored.
// One pending invite per club and email; re-inviting replaces it.
export const staffInvites = sqliteTable(
	'staff_invites',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		// Always stored lowercase.
		email: text('email').notNull(),
		role: text('role', { enum: STAFF_ROLES }).notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		invitedByUserId: text('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex('staff_invites_org_email_uq').on(table.orgId, table.email),
		check('staff_invites_role_check', sql`${table.role} IN ('owner', 'admin', 'staff')`),
	],
);

export type Organization = typeof organizations.$inferSelect;
export type OrgStaff = typeof orgStaff.$inferSelect;
