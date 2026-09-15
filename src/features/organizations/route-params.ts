import type { Context } from 'hono';
import type { AppEnv } from '../../app-env';
import { validationError } from '../../lib/errors';

/** The club address for routers mounted under /api/orgs/:slug. */
export function slugParam(c: Context<AppEnv>): string {
	const slug = c.req.param('slug');
	if (!slug) throw validationError('Missing club address');
	return slug;
}
