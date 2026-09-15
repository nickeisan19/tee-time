import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt, uuidPrimaryKey } from '../../db/columns';

// Tables required by Better Auth (https://www.better-auth.com/docs/concepts/database).
// Property names must match Better Auth's field names; column names are snake_case.

export const users = sqliteTable('users', {
	id: uuidPrimaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	phone: text('phone'),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const sessions = sqliteTable(
	'sessions',
	{
		id: uuidPrimaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const accounts = sqliteTable(
	'accounts',
	{
		id: uuidPrimaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// "credential" for email + password, otherwise the OAuth provider id (e.g. "google").
		providerId: text('provider_id').notNull(),
		accountId: text('account_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
		scope: text('scope'),
		// Password hash (never plaintext) for the "credential" provider only.
		password: text('password'),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index('accounts_user_id_idx').on(table.userId),
		uniqueIndex('accounts_provider_account_uq').on(table.providerId, table.accountId),
	],
);

// Better Auth rate-limit counters. Stored in D1 because in-memory counters don't survive
// across Worker isolates. `lastRequest` is epoch milliseconds.
export const rateLimits = sqliteTable('rate_limits', {
	id: uuidPrimaryKey(),
	key: text('key').notNull().unique(),
	count: integer('count').notNull(),
	lastRequest: integer('last_request').notNull(),
});

export const verifications = sqliteTable(
	'verifications',
	{
		id: uuidPrimaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index('verifications_identifier_idx').on(table.identifier)],
);
