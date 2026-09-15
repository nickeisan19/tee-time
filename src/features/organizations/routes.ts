import { Hono } from 'hono';
import type { AppEnv } from '../../app-env';
import { ok } from '../../lib/api-response';
import { parseJsonBody } from '../../lib/validation';
import { requireUser } from '../auth/middleware';
import { inviteServiceFor, organizationServiceFor } from './context';
import { createClubSchema, inviteStaffSchema } from './validation';

export const organizationRoutes = new Hono<AppEnv>()
	.post('/', requireUser, async (c) => {
		const input = await parseJsonBody(c, createClubSchema);
		const club = await organizationServiceFor(c).createClub(input, c.var.user.id);
		return ok(c, club, 201);
	})
	.get('/:slug', async (c) => {
		const club = await organizationServiceFor(c).getClub(c.req.param('slug'));
		return ok(c, club);
	})
	.get('/:slug/staff', requireUser, async (c) => {
		const staff = await organizationServiceFor(c).listStaff(c.req.param('slug'), c.var.user.id);
		return ok(c, staff);
	})
	.delete('/:slug/staff/:userId', requireUser, async (c) => {
		await organizationServiceFor(c).removeStaff(c.req.param('slug'), c.var.user.id, c.req.param('userId'));
		return ok(c, null);
	})
	.get('/:slug/staff/invites', requireUser, async (c) => {
		const invites = await inviteServiceFor(c).listPending(c.req.param('slug'), c.var.user.id);
		return ok(c, invites);
	})
	.post('/:slug/staff/invites', requireUser, async (c) => {
		const input = await parseJsonBody(c, inviteStaffSchema);
		await inviteServiceFor(c).invite(c.req.param('slug'), c.var.user.id, input);
		// Same response whether or not the email belongs to an existing account.
		return ok(c, null, 202);
	})
	.delete('/:slug/staff/invites/:inviteId', requireUser, async (c) => {
		await inviteServiceFor(c).revoke(c.req.param('slug'), c.var.user.id, c.req.param('inviteId'));
		return ok(c, null);
	});
