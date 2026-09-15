import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt, uuidPrimaryKey } from '../../db/columns';
import { users } from '../auth/schema';

export const STAFF_ROLES = ['owner', 'admin', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// One row per golf club (the tenant).
export const organizations = sqliteTable('organizations', {
	id: uuidPrimaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	// IANA timezone, e.g. "America/Chicago". Tee sheets are generated in club-local time.
	timezone: text('timezone').notNull(),
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
