import { Hono } from 'hono';
import type { AppEnv } from '../../app-env';
import { ok } from '../../lib/api-response';
import { validationError } from '../../lib/errors';
import { parseJsonBody } from '../../lib/validation';
import { requireUser } from '../auth/middleware';
import { slugParam } from '../organizations/route-params';
import { membershipInviteServiceFor, membershipServiceFor, tierServiceFor } from './context';
import {
	acceptMembershipInviteSchema,
	approveMembershipSchema,
	createTierSchema,
	denyMembershipSchema,
	listMembershipsQuerySchema,
	membershipEventsQuerySchema,
	membershipInviteSchema,
	membershipRequestSchema,
	updateMembershipSchema,
	updateTierSchema,
} from './validation';


/** Club-scoped membership routes, mounted under /api/orgs/:slug. */
export const membershipRoutes = new Hono<AppEnv>()
	.get('/membership-tiers', async (c) => ok(c, await tierServiceFor(c).list(slugParam(c))))
	.post('/membership-tiers', requireUser, async (c) => {
		const input = await parseJsonBody(c, createTierSchema);
		return ok(c, await tierServiceFor(c).create(slugParam(c), c.var.user.id, input), 201);
	})
	.patch('/membership-tiers/:tierId', requireUser, async (c) => {
		const patch = await parseJsonBody(c, updateTierSchema);
		return ok(c, await tierServiceFor(c).update(slugParam(c), c.var.user.id, c.req.param('tierId'), patch));
	})
	.delete('/membership-tiers/:tierId', requireUser, async (c) => {
		await tierServiceFor(c).remove(slugParam(c), c.var.user.id, c.req.param('tierId'));
		return ok(c, null);
	})
	.post('/membership-requests', requireUser, async (c) => {
		const input = await parseJsonBody(c, membershipRequestSchema);
		return ok(c, await membershipServiceFor(c).request(slugParam(c), c.var.user, input), 201);
	})
	.get('/memberships/me', requireUser, async (c) => ok(c, await membershipServiceFor(c).mine(slugParam(c), c.var.user)))
	.get('/memberships', requireUser, async (c) => {
		const query = listMembershipsQuerySchema.safeParse({ status: c.req.query('status'), q: c.req.query('q') });
		if (!query.success) throw validationError('Use a known membership status and a search of at most 100 characters');
		const { status, q } = query.data;
		return ok(c, await membershipServiceFor(c).list(slugParam(c), c.var.user.id, { status, search: q || undefined }));
	})
	.get('/memberships/:membershipId/events', requireUser, async (c) =>
		ok(c, await membershipServiceFor(c).membershipEvents(slugParam(c), c.var.user.id, c.req.param('membershipId'))),
	)
	.get('/membership-events', requireUser, async (c) => {
		const query = membershipEventsQuerySchema.safeParse({ limit: c.req.query('limit') });
		if (!query.success) throw validationError('limit: Use a number from 1 to 200');
		return ok(c, await membershipServiceFor(c).clubEvents(slugParam(c), c.var.user.id, query.data.limit));
	})
	.post('/memberships/:membershipId/approve', requireUser, async (c) => {
		const input = await parseJsonBody(c, approveMembershipSchema);
		return ok(c, await membershipServiceFor(c).approve(slugParam(c), c.var.user.id, c.req.param('membershipId'), input));
	})
	.post('/memberships/:membershipId/deny', requireUser, async (c) => {
		const input = await parseJsonBody(c, denyMembershipSchema);
		return ok(c, await membershipServiceFor(c).deny(slugParam(c), c.var.user.id, c.req.param('membershipId'), input));
	})
	.patch('/memberships/:membershipId', requireUser, async (c) => {
		const input = await parseJsonBody(c, updateMembershipSchema);
		return ok(c, await membershipServiceFor(c).update(slugParam(c), c.var.user.id, c.req.param('membershipId'), input));
	})
	.get('/membership-invites', requireUser, async (c) => ok(c, await membershipInviteServiceFor(c).listPending(slugParam(c), c.var.user.id)))
	.post('/membership-invites', requireUser, async (c) => {
		const input = await parseJsonBody(c, membershipInviteSchema);
		await membershipInviteServiceFor(c).invite(slugParam(c), c.var.user.id, input);
		// Same response whether or not the email belongs to an existing account.
		return ok(c, null, 202);
	})
	.delete('/membership-invites/:inviteId', requireUser, async (c) => {
		await membershipInviteServiceFor(c).revoke(slugParam(c), c.var.user.id, c.req.param('inviteId'));
		return ok(c, null);
	});

/** Invite acceptance isn't tied to a club address; the token identifies the club. */
export const membershipInviteAcceptRoutes = new Hono<AppEnv>().post('/accept', requireUser, async (c) => {
	const { token } = await parseJsonBody(c, acceptMembershipInviteSchema);
	return ok(c, await membershipInviteServiceFor(c).accept(token, c.var.user));
});
