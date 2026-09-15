import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt, uuidPrimaryKey } from '../../db/columns';
import { organizations } from '../organizations/schema';

export const MIN_TURN_MINUTES = 30;
export const MAX_TURN_MINUTES = 300;
export const DEFAULT_TURN_MINUTES = 135;

// A physical nine. An 18-hole round is two nines played back to back (see routes).
export const nines = sqliteTable(
	'nines',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		// Typical minutes to play this nine: when an 18-hole group reaches the second nine.
		turnMinutes: integer('turn_minutes').notNull().default(DEFAULT_TURN_MINUTES),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex('nines_org_name_uq').on(table.orgId, table.name),
		check(
			'nines_turn_minutes_check',
			sql`${table.turnMinutes} BETWEEN ${sql.raw(String(MIN_TURN_MINUTES))} AND ${sql.raw(String(MAX_TURN_MINUTES))}`,
		),
	],
);

// A playable 18-hole combination of two different nines. Golfers may start on either nine
// (a split tee). The pair is stored with nine_a_id < nine_b_id so (A, B) and (B, A) are one route.
export const routes = sqliteTable(
	'routes',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		// NO ACTION: a nine used by a route can't be deleted, but deleting the club still cascades.
		nineAId: text('nine_a_id')
			.notNull()
			.references(() => nines.id, { onDelete: 'no action' }),
		nineBId: text('nine_b_id')
			.notNull()
			.references(() => nines.id, { onDelete: 'no action' }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex('routes_org_name_uq').on(table.orgId, table.name),
		uniqueIndex('routes_org_nines_uq').on(table.orgId, table.nineAId, table.nineBId),
		check('routes_nine_order_check', sql`${table.nineAId} < ${table.nineBId}`),
	],
);
