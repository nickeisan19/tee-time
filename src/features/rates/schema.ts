import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt, uuidPrimaryKey } from '../../db/columns';
import { membershipTiers } from '../memberships/schema';
import { organizations } from '../organizations/schema';
import { DAY_TYPES, RATE_AUDIENCES } from './pricing';

// The club's price list. Member and member-guest prices are set per tier; public prices have no tier.
export const rates = sqliteTable(
	'rates',
	{
		id: uuidPrimaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		holes: integer('holes').notNull(),
		audience: text('audience', { enum: RATE_AUDIENCES }).notNull(),
		// A tier's prices mean nothing once the tier is gone, so they go with it.
		tierId: text('tier_id').references(() => membershipTiers.id, { onDelete: 'cascade' }),
		// SQLite treats NULLs as distinct in unique indexes, so public rates are compared on ''.
		tierKey: text('tier_key').generatedAlwaysAs(sql`coalesce(tier_id, '')`, { mode: 'virtual' }),
		dayType: text('day_type', { enum: DAY_TYPES }).notNull(),
		amountCents: integer('amount_cents').notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex('rates_org_key_uq').on(table.orgId, table.holes, table.audience, table.tierKey, table.dayType),
		check('rates_holes_check', sql`${table.holes} IN (9, 18)`),
		check('rates_audience_check', sql`${table.audience} IN ('member', 'member_guest', 'public')`),
		check('rates_day_type_check', sql`${table.dayType} IN ('weekday', 'weekend')`),
		check('rates_tier_check', sql`(${table.audience} = 'public') = (${table.tierId} IS NULL)`),
		check('rates_amount_check', sql`${table.amountCents} >= 0`),
	],
);
