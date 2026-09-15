import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt, uuidPrimaryKey } from '../../db/columns';
import { nines } from '../courses/schema';
import { organizations } from '../organizations/schema';

export const MAX_PLAYERS_PER_TEE_TIME = 6;
const LAST_MINUTE_OF_DAY = 24 * 60 - 1;

export const TEE_TIME_STATUSES = ['open', 'blocked'] as const;
export type TeeTimeStatus = (typeof TEE_TIME_STATUSES)[number];

// Weekly template for one nine: at most one rule per day of the week (0 = Sunday).
export const teeSheetRules = sqliteTable(
	'tee_sheet_rules',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		nineId: text('nine_id')
			.notNull()
			.references(() => nines.id, { onDelete: 'cascade' }),
		dayOfWeek: integer('day_of_week').notNull(),
		// Club-local minutes after midnight.
		firstTeeMinute: integer('first_tee_minute').notNull(),
		lastTeeMinute: integer('last_tee_minute').notNull(),
		intervalMinutes: integer('interval_minutes').notNull(),
		maxPlayers: integer('max_players').notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex('tee_sheet_rules_nine_day_uq').on(table.nineId, table.dayOfWeek),
		check('tee_sheet_rules_day_check', sql`${table.dayOfWeek} BETWEEN 0 AND 6`),
		check(
			'tee_sheet_rules_minutes_check',
			sql`${table.firstTeeMinute} BETWEEN 0 AND ${sql.raw(String(LAST_MINUTE_OF_DAY))} AND ${table.lastTeeMinute} BETWEEN ${table.firstTeeMinute} AND ${sql.raw(String(LAST_MINUTE_OF_DAY))}`,
		),
		check('tee_sheet_rules_interval_check', sql`${table.intervalMinutes} BETWEEN 1 AND 120`),
		check('tee_sheet_rules_players_check', sql`${table.maxPlayers} BETWEEN 1 AND ${sql.raw(String(MAX_PLAYERS_PER_TEE_TIME))}`),
	],
);

// One bookable start on one nine. `booked_players` is guarded by the CHECK below so a batch that
// would overfill a tee time fails as a whole (Phase 4 bookings rely on this).
export const teeTimes = sqliteTable(
	'tee_times',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		// NO ACTION: a nine with tee times can't be deleted, but deleting the club still cascades.
		nineId: text('nine_id')
			.notNull()
			.references(() => nines.id, { onDelete: 'no action' }),
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
		// Club-local date (YYYY-MM-DD) and time (HH:MM), stored for tee sheet queries.
		localDate: text('local_date').notNull(),
		localTime: text('local_time').notNull(),
		maxPlayers: integer('max_players').notNull(),
		bookedPlayers: integer('booked_players').notNull().default(0),
		status: text('status', { enum: TEE_TIME_STATUSES }).notNull().default('open'),
		membersOnly: integer('members_only', { mode: 'boolean' }).notNull().default(false),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex('tee_times_nine_starts_uq').on(table.nineId, table.startsAt),
		index('tee_times_org_date_idx').on(table.orgId, table.localDate, table.localTime),
		check('tee_times_status_check', sql`${table.status} IN ('open', 'blocked')`),
		check('tee_times_max_players_check', sql`${table.maxPlayers} BETWEEN 1 AND ${sql.raw(String(MAX_PLAYERS_PER_TEE_TIME))}`),
		check('tee_times_capacity_check', sql`${table.bookedPlayers} BETWEEN 0 AND ${table.maxPlayers}`),
	],
);
