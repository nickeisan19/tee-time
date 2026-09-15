import { type Context, Hono } from 'hono';
import type { AppEnv } from '../../app-env';
import { ok } from '../../lib/api-response';
import { parseJsonBody } from '../../lib/validation';
import { requireUser } from '../auth/middleware';
import { createOrganizationRepository } from '../organizations/repository';
import { slugParam } from '../organizations/route-params';
import { createCourseService } from './course-service';
import { createNineRepository } from './nine-repository';
import { createRouteRepository } from './route-repository';
import { createNineSchema, createRouteSchema, updateNineSchema, updateRouteSchema } from './validation';

function courseServiceFor(c: Context<AppEnv>) {
	return createCourseService({
		organizations: createOrganizationRepository(c.var.db),
		nines: createNineRepository(c.var.db),
		routes: createRouteRepository(c.var.db),
	});
}

/** Nines and 18-hole routes, mounted under /api/orgs/:slug. Anyone can list; owners and admins manage. */
export const courseRoutes = new Hono<AppEnv>()
	.get('/nines', async (c) => ok(c, await courseServiceFor(c).listNines(slugParam(c))))
	.post('/nines', requireUser, async (c) => {
		const input = await parseJsonBody(c, createNineSchema);
		return ok(c, await courseServiceFor(c).createNine(slugParam(c), c.var.user.id, input), 201);
	})
	.patch('/nines/:nineId', requireUser, async (c) => {
		const patch = await parseJsonBody(c, updateNineSchema);
		return ok(c, await courseServiceFor(c).updateNine(slugParam(c), c.var.user.id, c.req.param('nineId'), patch));
	})
	.delete('/nines/:nineId', requireUser, async (c) => {
		await courseServiceFor(c).deleteNine(slugParam(c), c.var.user.id, c.req.param('nineId'));
		return ok(c, null);
	})
	.get('/routes', async (c) => ok(c, await courseServiceFor(c).listRoutes(slugParam(c))))
	.post('/routes', requireUser, async (c) => {
		const input = await parseJsonBody(c, createRouteSchema);
		return ok(c, await courseServiceFor(c).createRoute(slugParam(c), c.var.user.id, input), 201);
	})
	.patch('/routes/:routeId', requireUser, async (c) => {
		const { name } = await parseJsonBody(c, updateRouteSchema);
		return ok(c, await courseServiceFor(c).renameRoute(slugParam(c), c.var.user.id, c.req.param('routeId'), name));
	})
	.delete('/routes/:routeId', requireUser, async (c) => {
		await courseServiceFor(c).deleteRoute(slugParam(c), c.var.user.id, c.req.param('routeId'));
		return ok(c, null);
	});
