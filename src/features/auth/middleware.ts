import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../../app-env';
import { unauthenticated } from '../../lib/errors';

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
	const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw unauthenticated();

	c.set('user', { id: session.user.id, email: session.user.email, name: session.user.name });
	await next();
});
