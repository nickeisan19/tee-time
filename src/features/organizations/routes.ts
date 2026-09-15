import { Hono } from 'hono';
import type { AppEnv } from '../../app-env';
import { ok } from '../../lib/api-response';
import { notFound } from '../../lib/errors';
import { parseJsonBody } from '../../lib/validation';
import { requireUser } from '../auth/middleware';
import { toClubDetails } from './club-details';
import { inviteServiceFor, logoServiceFor, organizationServiceFor } from './context';
import { clubSettingsSchema, createClubSchema, inviteStaffSchema } from './validation';

export const organizationRoutes = new Hono<AppEnv>()
	.post('/', requireUser, async (c) => {
		const input = await parseJsonBody(c, createClubSchema);
		const club = await organizationServiceFor(c).createClub(input, c.var.user.id);
		return ok(c, toClubDetails(club), 201);
	})
	.get('/:slug', async (c) => {
		const club = await organizationServiceFor(c).getClub(c.req.param('slug'));
		return ok(c, toClubDetails(club));
	})
	.patch('/:slug/settings', requireUser, async (c) => {
		const settings = await parseJsonBody(c, clubSettingsSchema);
		const club = await organizationServiceFor(c).updateSettings(c.req.param('slug'), c.var.user.id, settings);
		return ok(c, toClubDetails(club));
	})
	.put('/:slug/logo', requireUser, async (c) => {
		const club = await logoServiceFor(c).upload(c.req.param('slug'), c.var.user.id, {
			declaredType: c.req.header('content-type'),
			declaredLength: c.req.header('content-length'),
			body: c.req.raw.body,
		});
		return ok(c, toClubDetails(club));
	})
	.delete('/:slug/logo', requireUser, async (c) => {
		const club = await logoServiceFor(c).remove(c.req.param('slug'), c.var.user.id);
		return ok(c, toClubDetails(club));
	})
	.get('/:slug/logo', async (c) => {
		const logo = await logoServiceFor(c).get(c.req.param('slug'));
		if (!logo) throw notFound('This club has no logo');
		return new Response(logo.body, {
			headers: {
				'content-type': logo.contentType,
				// The URL changes whenever the logo does (?v=<timestamp>), so it can be cached forever.
				'cache-control': 'public, max-age=31536000, immutable',
				'x-content-type-options': 'nosniff',
				'content-security-policy': "default-src 'none'; sandbox",
			},
		});
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
