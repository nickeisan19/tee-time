import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { teeTimes } from '../tee-sheet/schema';
import { nines, routes } from './schema';
import type { CreateNineInput, UpdateNineInput } from './validation';

export interface Nine {
	id: string;
	name: string;
	sortOrder: number;
	turnMinutes: number;
}

/** Data access for nines. Every query is scoped by `orgId`. */
export interface NineRepository {
	list(orgId: string): Promise<Nine[]>;
	count(orgId: string): Promise<number>;
	findManyInClub(orgId: string, nineIds: readonly string[]): Promise<Nine[]>;
	create(orgId: string, input: CreateNineInput): Promise<Nine>;
	update(orgId: string, nineId: string, patch: UpdateNineInput): Promise<Nine | null>;
	/** Deletes the nine in one statement unless a route or tee time uses it. */
	deleteIfUnused(orgId: string, nineId: string): Promise<'deleted' | 'in_use' | 'not_found'>;
}

export const nineColumns = {
	id: nines.id,
	name: nines.name,
	sortOrder: nines.sortOrder,
	turnMinutes: nines.turnMinutes,
};

export function createNineRepository(db: Database): NineRepository {
	const findManyInClub = async (orgId: string, nineIds: readonly string[]): Promise<Nine[]> => {
		if (nineIds.length === 0) return [];
		return db
			.select(nineColumns)
			.from(nines)
			.where(and(eq(nines.orgId, orgId), inArray(nines.id, [...nineIds])));
	};

	return {
		findManyInClub,

		async count(orgId) {
			const [row] = await db.select({ total: sql<number>`count(*)` }).from(nines).where(eq(nines.orgId, orgId));
			return Number(row?.total ?? 0);
		},

		async list(orgId) {
			return db
				.select(nineColumns)
				.from(nines)
				.where(eq(nines.orgId, orgId))
				.orderBy(asc(nines.sortOrder), asc(nines.createdAt), sql`${nines}.rowid`);
		},

		async create(orgId, input) {
			const [nine] = await db
				.insert(nines)
				.values({ orgId, ...input })
				.returning(nineColumns);
			return nine;
		},

		async update(orgId, nineId, patch) {
			const [nine] = await db
				.update(nines)
				.set(patch)
				.where(and(eq(nines.orgId, orgId), eq(nines.id, nineId)))
				.returning(nineColumns);
			return nine ?? null;
		},

		async deleteIfUnused(orgId, nineId) {
			const usedByRoute = sql`EXISTS (SELECT 1 FROM ${routes} WHERE ${or(eq(routes.nineAId, nines.id), eq(routes.nineBId, nines.id))})`;
			const hasTeeTimes = sql`EXISTS (SELECT 1 FROM ${teeTimes} WHERE ${teeTimes.nineId} = ${nines.id})`;
			const deleted = await db
				.delete(nines)
				.where(and(eq(nines.orgId, orgId), eq(nines.id, nineId), sql`NOT ${usedByRoute}`, sql`NOT ${hasTeeTimes}`))
				.returning({ id: nines.id });
			if (deleted.length > 0) return 'deleted';
			return (await findManyInClub(orgId, [nineId])).length > 0 ? 'in_use' : 'not_found';
		},
	};
}
