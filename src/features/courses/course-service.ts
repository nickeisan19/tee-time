import { isUniqueViolation } from '../../db/errors';
import { conflict, notFound } from '../../lib/errors';
import { loadClub, requireClubManager } from '../organizations/club-access';
import type { OrganizationRepository } from '../organizations/repository';
import type { Nine, NineRepository } from './nine-repository';
import type { CourseRoute, RouteRepository } from './route-repository';
import { type CreateNineInput, type CreateRouteInput, MAX_NINES_PER_CLUB, type UpdateNineInput } from './validation';

interface CourseServiceDependencies {
	organizations: OrganizationRepository;
	nines: NineRepository;
	routes: RouteRepository;
}

export interface CourseService {
	listNines(slug: string): Promise<Nine[]>;
	createNine(slug: string, actorUserId: string, input: CreateNineInput): Promise<Nine>;
	updateNine(slug: string, actorUserId: string, nineId: string, patch: UpdateNineInput): Promise<Nine>;
	deleteNine(slug: string, actorUserId: string, nineId: string): Promise<void>;
	listRoutes(slug: string): Promise<CourseRoute[]>;
	createRoute(slug: string, actorUserId: string, input: CreateRouteInput): Promise<CourseRoute>;
	renameRoute(slug: string, actorUserId: string, routeId: string, name: string): Promise<CourseRoute>;
	deleteRoute(slug: string, actorUserId: string, routeId: string): Promise<void>;
}

function rethrowNineNameTaken(error: unknown): never {
	if (isUniqueViolation(error, 'nines.name')) throw conflict('NINE_NAME_TAKEN', 'This club already has a nine with that name');
	throw error;
}

function rethrowRouteConflict(error: unknown): never {
	if (isUniqueViolation(error, 'routes.name')) throw conflict('ROUTE_NAME_TAKEN', 'This club already has a route with that name');
	if (isUniqueViolation(error, 'routes.nine_a_id')) throw conflict('ROUTE_EXISTS', 'A route with those two nines already exists');
	throw error;
}

export function createCourseService({ organizations, nines, routes }: CourseServiceDependencies): CourseService {
	async function managedClub(slug: string, actorUserId: string) {
		const club = await loadClub(organizations, slug);
		await requireClubManager(organizations, club, actorUserId);
		return club;
	}

	async function requireRoute(orgId: string, routeId: string): Promise<CourseRoute> {
		const route = await routes.find(orgId, routeId);
		if (!route) throw notFound('Route not found');
		return route;
	}

	return {
		async listNines(slug) {
			const club = await loadClub(organizations, slug);
			return nines.list(club.id);
		},

		async createNine(slug, actorUserId, input) {
			const club = await managedClub(slug, actorUserId);
			if ((await nines.count(club.id)) >= MAX_NINES_PER_CLUB) {
				throw conflict('LIMIT_REACHED', `A club can have at most ${MAX_NINES_PER_CLUB} nines`);
			}
			return nines.create(club.id, input).catch(rethrowNineNameTaken);
		},

		async updateNine(slug, actorUserId, nineId, patch) {
			const club = await managedClub(slug, actorUserId);
			const nine = await nines.update(club.id, nineId, patch).catch(rethrowNineNameTaken);
			if (!nine) throw notFound('Nine not found');
			return nine;
		},

		async deleteNine(slug, actorUserId, nineId) {
			const club = await managedClub(slug, actorUserId);
			const result = await nines.deleteIfUnused(club.id, nineId);
			if (result === 'in_use') throw conflict('NINE_IN_USE', 'Remove this nine’s routes and tee times before deleting it');
			if (result === 'not_found') throw notFound('Nine not found');
		},

		async listRoutes(slug) {
			const club = await loadClub(organizations, slug);
			return routes.list(club.id);
		},

		async createRoute(slug, actorUserId, { name, nineIds }) {
			const club = await managedClub(slug, actorUserId);
			const found = await nines.findManyInClub(club.id, nineIds);
			if (found.length !== nineIds.length) throw notFound('Nine not found');

			const [first, second] = [...nineIds].sort();
			const routeId = await routes.create(club.id, name, [first, second]).catch(rethrowRouteConflict);
			return requireRoute(club.id, routeId);
		},

		async renameRoute(slug, actorUserId, routeId, name) {
			const club = await managedClub(slug, actorUserId);
			const renamed = await routes.rename(club.id, routeId, name).catch(rethrowRouteConflict);
			if (!renamed) throw notFound('Route not found');
			return requireRoute(club.id, routeId);
		},

		async deleteRoute(slug, actorUserId, routeId) {
			const club = await managedClub(slug, actorUserId);
			if (!(await routes.delete(club.id, routeId))) throw notFound('Route not found');
		},
	};
}
