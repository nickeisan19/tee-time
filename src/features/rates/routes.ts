import { type Context, Hono } from 'hono';
import type { AppEnv } from '../../app-env';
import { ok } from '../../lib/api-response';
import { parseJsonBody } from '../../lib/validation';
import { requireUser } from '../auth/middleware';
import { createTierRepository } from '../memberships/tier-repository';
import { createOrganizationRepository } from '../organizations/repository';
import { slugParam } from '../organizations/route-params';
import { createRateService } from './rate-service';
import { createRateRepository } from './repository';
import { setRateSchema } from './validation';

function rateServiceFor(c: Context<AppEnv>) {
	return createRateService({
		organizations: createOrganizationRepository(c.var.db),
		tiers: createTierRepository(c.var.db),
		rates: createRateRepository(c.var.db),
	});
}

/** The club's rate card, mounted under /api/orgs/:slug. Anyone can view; owners and admins manage. */
export const rateRoutes = new Hono<AppEnv>()
	.get('/rates', async (c) => ok(c, await rateServiceFor(c).list(slugParam(c))))
	.put('/rates', requireUser, async (c) => {
		const input = await parseJsonBody(c, setRateSchema);
		return ok(c, await rateServiceFor(c).set(slugParam(c), c.var.user.id, input));
	})
	.delete('/rates/:rateId', requireUser, async (c) => {
		await rateServiceFor(c).remove(slugParam(c), c.var.user.id, c.req.param('rateId'));
		return ok(c, null);
	});
