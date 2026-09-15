import { type Context, Hono } from 'hono';
import type { AppEnv } from '../../app-env';
import { ok } from '../../lib/api-response';
import { validationError } from '../../lib/errors';
import { createRateLimiter } from '../../lib/rate-limit';
import { parseJsonBody } from '../../lib/validation';
import { requireUser } from '../auth/middleware';
import { createNineRepository } from '../courses/nine-repository';
import { createRouteRepository } from '../courses/route-repository';
import { createMembershipRepository } from '../memberships/membership-repository';
import { createOrganizationRepository } from '../organizations/repository';
import { slugParam } from '../organizations/route-params';
import { createRateRepository } from '../rates/repository';
import { createBookingService } from './booking-service';
import { createBookingRepository } from './repository';
import { availabilityQuerySchema, bookingsByDateQuerySchema, createBookingSchema } from './validation';

function bookingServiceFor(c: Context<AppEnv>) {
	return createBookingService({
		organizations: createOrganizationRepository(c.var.db),
		memberships: createMembershipRepository(c.var.db),
		nines: createNineRepository(c.var.db),
		routes: createRouteRepository(c.var.db),
		rates: createRateRepository(c.var.db),
		bookings: createBookingRepository(c.var.db),
		emailSender: c.var.emailSender,
		rateLimiter: createRateLimiter(c.var.db, c.var.config.authSecret),
	});
}

/** Availability and bookings, mounted under /api/orgs/:slug. */
export const bookingRoutes = new Hono<AppEnv>()
	.get('/availability', requireUser, async (c) => {
		const query = availabilityQuerySchema.safeParse({ date: c.req.query('date'), holes: c.req.query('holes'), players: c.req.query('players') });
		if (!query.success) throw validationError('Use a date like 2026-10-05, 9 or 18 holes, and 1 to 6 players');
		return ok(c, await bookingServiceFor(c).availability(slugParam(c), c.var.user, query.data));
	})
	.post('/bookings', requireUser, async (c) => {
		const input = await parseJsonBody(c, createBookingSchema);
		return ok(c, await bookingServiceFor(c).book(slugParam(c), c.var.user, input), 201);
	})
	.get('/bookings/mine', requireUser, async (c) => ok(c, await bookingServiceFor(c).mine(slugParam(c), c.var.user)))
	.get('/bookings', requireUser, async (c) => {
		const query = bookingsByDateQuerySchema.safeParse({ date: c.req.query('date') });
		if (!query.success) throw validationError('date: Use a date like 2026-10-05');
		return ok(c, await bookingServiceFor(c).forDate(slugParam(c), c.var.user.id, query.data.date));
	})
	.post('/bookings/:bookingId/cancel', requireUser, async (c) =>
		ok(c, await bookingServiceFor(c).cancel(slugParam(c), c.var.user, c.req.param('bookingId'))),
	);
