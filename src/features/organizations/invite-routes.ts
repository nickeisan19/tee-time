import { Hono } from 'hono';
import type { AppEnv } from '../../app-env';
import { ok } from '../../lib/api-response';
import { parseJsonBody } from '../../lib/validation';
import { requireUser } from '../auth/middleware';
import { inviteServiceFor } from './context';
import { acceptInviteSchema } from './validation';

export const inviteRoutes = new Hono<AppEnv>().post('/accept', requireUser, async (c) => {
	const { token } = await parseJsonBody(c, acceptInviteSchema);
	const accepted = await inviteServiceFor(c).accept(token, c.var.user);
	return ok(c, accepted);
});
