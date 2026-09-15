import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { memberships, membershipTiers } from './schema';
import type { CreateTierInput, UpdateTierInput } from './validation';

export interface Tier {
	id: string;
	name: string;
	bookingWindowDays: number;
}

/** Data access for membership tiers. Every query is scoped by `orgId`. */
export interface TierRepository {
	list(orgId: string): Promise<Tier[]>;
	findInClub(orgId: string, tierId: string): Promise<Tier | null>;
	create(orgId: string, input: CreateTierInput): Promise<Tier>;
	update(orgId: string, tierId: string, patch: UpdateTierInput): Promise<Tier | null>;
	/** Deletes the tier in one statement unless a membership still holds it. */
	deleteIfUnused(orgId: string, tierId: string): Promise<'deleted' | 'in_use' | 'not_found'>;
}

export const tierColumns = {
	id: membershipTiers.id,
	name: membershipTiers.name,
	bookingWindowDays: membershipTiers.bookingWindowDays,
};

export function createTierRepository(db: Database): TierRepository {
	const findInClub = async (orgId: string, tierId: string): Promise<Tier | null> => {
		const [tier] = await db
			.select(tierColumns)
			.from(membershipTiers)
			.where(and(eq(membershipTiers.orgId, orgId), eq(membershipTiers.id, tierId)))
			.limit(1);
		return tier ?? null;
	};

	return {
		async list(orgId) {
			return db
				.select(tierColumns)
				.from(membershipTiers)
				.where(eq(membershipTiers.orgId, orgId))
				.orderBy(asc(membershipTiers.createdAt), sql`${membershipTiers}.rowid`);
		},

		findInClub,

		async create(orgId, input) {
			const [tier] = await db
				.insert(membershipTiers)
				.values({ orgId, ...input })
				.returning(tierColumns);
			return tier;
		},

		async update(orgId, tierId, patch) {
			const [tier] = await db
				.update(membershipTiers)
				.set(patch)
				.where(and(eq(membershipTiers.orgId, orgId), eq(membershipTiers.id, tierId)))
				.returning(tierColumns);
			return tier ?? null;
		},

		async deleteIfUnused(orgId, tierId) {
			const deleted = await db
				.delete(membershipTiers)
				.where(
					and(
						eq(membershipTiers.orgId, orgId),
						eq(membershipTiers.id, tierId),
						sql`NOT EXISTS (SELECT 1 FROM ${memberships} WHERE ${memberships.tierId} = ${membershipTiers.id})`,
					),
				)
				.returning({ id: membershipTiers.id });
			if (deleted.length > 0) return 'deleted';
			return (await findInClub(orgId, tierId)) ? 'in_use' : 'not_found';
		},
	};
}
