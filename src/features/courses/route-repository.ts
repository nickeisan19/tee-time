import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Database } from '../../db/client';
import { nines, routes } from './schema';

export interface CourseRoute {
	id: string;
	name: string;
	nines: [{ id: string; name: string }, { id: string; name: string }];
}

/** Data access for 18-hole routes. Every query is scoped by `orgId`. */
export interface RouteRepository {
	list(orgId: string): Promise<CourseRoute[]>;
	find(orgId: string, routeId: string): Promise<CourseRoute | null>;
	/** `nineIds` must already be sorted so the pair is stored in canonical order. */
	create(orgId: string, name: string, nineIds: readonly [string, string]): Promise<string>;
	rename(orgId: string, routeId: string, name: string): Promise<boolean>;
	delete(orgId: string, routeId: string): Promise<boolean>;
}

export function createRouteRepository(db: Database): RouteRepository {
	const nineA = alias(nines, 'nine_a');
	const nineB = alias(nines, 'nine_b');

	const selectRoutes = () =>
		db
			.select({
				id: routes.id,
				name: routes.name,
				nineA: { id: nineA.id, name: nineA.name },
				nineB: { id: nineB.id, name: nineB.name },
			})
			.from(routes)
			.innerJoin(nineA, eq(nineA.id, routes.nineAId))
			.innerJoin(nineB, eq(nineB.id, routes.nineBId));

	const toRoute = ({ id, name, nineA: first, nineB: second }: Awaited<ReturnType<typeof selectRoutes>>[number]): CourseRoute => ({
		id,
		name,
		nines: [first, second],
	});

	return {
		async list(orgId) {
			const rows = await selectRoutes()
				.where(eq(routes.orgId, orgId))
				.orderBy(asc(routes.createdAt), sql`${routes}.rowid`);
			return rows.map(toRoute);
		},

		async find(orgId, routeId) {
			const [row] = await selectRoutes()
				.where(and(eq(routes.orgId, orgId), eq(routes.id, routeId)))
				.limit(1);
			return row ? toRoute(row) : null;
		},

		async create(orgId, name, [nineAId, nineBId]) {
			const [route] = await db.insert(routes).values({ orgId, name, nineAId, nineBId }).returning({ id: routes.id });
			return route.id;
		},

		async rename(orgId, routeId, name) {
			const updated = await db
				.update(routes)
				.set({ name })
				.where(and(eq(routes.orgId, orgId), eq(routes.id, routeId)))
				.returning({ id: routes.id });
			return updated.length > 0;
		},

		async delete(orgId, routeId) {
			const deleted = await db
				.delete(routes)
				.where(and(eq(routes.orgId, orgId), eq(routes.id, routeId)))
				.returning({ id: routes.id });
			return deleted.length > 0;
		},
	};
}
