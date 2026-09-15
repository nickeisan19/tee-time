import { type Context, Hono } from 'hono';
import type { AppEnv } from '../../app-env';
import { ok } from '../../lib/api-response';
import { validationError } from '../../lib/errors';
import { createRateLimiter } from '../../lib/rate-limit';
import { parseJsonBody } from '../../lib/validation';
import { requireUser } from '../auth/middleware';
import { createNineRepository } from '../courses/nine-repository';
import { createOrganizationRepository } from '../organizations/repository';
import { slugParam } from '../organizations/route-params';
import { createTeeSheetRepository } from './repository';
import { createTeeSheetService } from './tee-sheet-service';
import { generateTeeSheetSchema, setTeeSheetRulesSchema, teeSheetQuerySchema, updateTeeTimesSchema } from './validation';

function teeSheetServiceFor(c: Context<AppEnv>) {
	return createTeeSheetService({
		organizations: createOrganizationRepository(c.var.db),
		nines: createNineRepository(c.var.db),
		teeSheets: createTeeSheetRepository(c.var.db),
		rateLimiter: createRateLimiter(c.var.db, c.var.config.authSecret),
	});
}

/** Tee sheet rules, generation, and staff tee sheet management, mounted under /api/orgs/:slug. */
export const teeSheetRoutes = new Hono<AppEnv>()
	.get('/nines/:nineId/tee-sheet-rules', requireUser, async (c) =>
		ok(c, await teeSheetServiceFor(c).listRules(slugParam(c), c.var.user.id, c.req.param('nineId'))),
	)
	.put('/nines/:nineId/tee-sheet-rules', requireUser, async (c) => {
		const { rules } = await parseJsonBody(c, setTeeSheetRulesSchema);
		return ok(c, await teeSheetServiceFor(c).setRules(slugParam(c), c.var.user.id, c.req.param('nineId'), rules));
	})
	.post('/tee-sheet/generate', requireUser, async (c) => {
		const { fromDate, toDate } = await parseJsonBody(c, generateTeeSheetSchema);
		return ok(c, await teeSheetServiceFor(c).generate(slugParam(c), c.var.user.id, fromDate, toDate));
	})
	.get('/tee-sheet', requireUser, async (c) => {
		const query = teeSheetQuerySchema.safeParse({ date: c.req.query('date') });
		if (!query.success) throw validationError('date: Use a date like 2026-10-05');
		return ok(c, await teeSheetServiceFor(c).view(slugParam(c), c.var.user.id, query.data.date));
	})
	.patch('/tee-times', requireUser, async (c) => {
		const update = await parseJsonBody(c, updateTeeTimesSchema);
		return ok(c, await teeSheetServiceFor(c).updateTeeTimes(slugParam(c), c.var.user.id, update));
	});
