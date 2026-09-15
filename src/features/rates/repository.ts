import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { membershipTiers } from '../memberships/schema';
import type { DayType, HoleCount, RateAudience, RateKey } from './pricing';
import { rates } from './schema';

export interface Rate {
	id: string;
	holes: HoleCount;
	audience: RateAudience;
	tier: { id: string; name: string } | null;
	dayType: DayType;
	amountCents: number;
}

/** Data access for the club's rate card. Every query is scoped by `orgId`. */
export interface RateRepository {
	list(orgId: string): Promise<Rate[]>;
	/** Creates the rate, or updates the price of the existing rate with the same key. Returns its id. */
	upsert(orgId: string, key: RateKey, amountCents: number): Promise<string>;
	delete(orgId: string, rateId: string): Promise<boolean>;
}

export function createRateRepository(db: Database): RateRepository {
	return {
		async list(orgId) {
			const rows = await db
				.select({
					id: rates.id,
					holes: rates.holes,
					audience: rates.audience,
					tier: { id: membershipTiers.id, name: membershipTiers.name },
					dayType: rates.dayType,
					amountCents: rates.amountCents,
				})
				.from(rates)
				.leftJoin(membershipTiers, eq(membershipTiers.id, rates.tierId))
				.where(eq(rates.orgId, orgId))
				.orderBy(asc(rates.holes), asc(rates.audience), asc(membershipTiers.name), asc(rates.dayType));
			// holes is constrained to 9 or 18 by the table's CHECK.
			return rows.map((row) => ({ ...row, holes: row.holes as HoleCount }));
		},

		async upsert(orgId, { holes, audience, tierId, dayType }, amountCents) {
			const [rate] = await db
				.insert(rates)
				.values({ orgId, holes, audience, tierId, dayType, amountCents })
				.onConflictDoUpdate({
					target: [rates.orgId, rates.holes, rates.audience, rates.tierKey, rates.dayType],
					set: { amountCents, updatedAt: new Date() },
				})
				.returning({ id: rates.id });
			return rate.id;
		},

		async delete(orgId, rateId) {
			const deleted = await db
				.delete(rates)
				.where(and(eq(rates.orgId, orgId), eq(rates.id, rateId)))
				.returning({ id: rates.id });
			return deleted.length > 0;
		},
	};
}
