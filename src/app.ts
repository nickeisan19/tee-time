import { Hono } from 'hono';
import type { AppEnv } from './app-env';
import { parseConfig } from './config/env';
import { createDb } from './db/client';
import { AUTH_BASE_PATH, createAuth } from './features/auth/auth';
import { membershipInviteAcceptRoutes, membershipRoutes } from './features/memberships/routes';
import { inviteRoutes } from './features/organizations/invite-routes';
import { organizationRoutes } from './features/organizations/routes';
import { errorBody } from './lib/api-response';
import { createEmailSender, type EmailSender } from './lib/email';
import { AppError } from './lib/errors';
import { createLogger } from './lib/logger';
import { RateLimitedError } from './lib/rate-limit';

export interface AppDependencies {
	/** Overrides the environment's email sender (tests capture emails this way). */
	emailSender?: EmailSender;
}

export function createApp(dependencies: AppDependencies = {}): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.use('*', async (c, next) => {
		const logger = createLogger({ requestId: c.req.header('cf-ray') ?? crypto.randomUUID() });
		c.set('logger', logger);

		const config = parseConfig(c.env);
		const db = createDb(c.env.DB);
		const emailSender = dependencies.emailSender ?? createEmailSender(config, logger);
		c.set('config', config);
		c.set('db', db);
		c.set('emailSender', emailSender);
		c.set('auth', createAuth({ config, db, emailSender }));
		await next();
	});

	app.on(['GET', 'POST'], `${AUTH_BASE_PATH}/*`, (c) => c.var.auth.handler(c.req.raw));
	app.route('/api/orgs', organizationRoutes);
	app.route('/api/orgs/:slug', membershipRoutes);
	app.route('/api/invites', inviteRoutes);
	app.route('/api/membership-invites', membershipInviteAcceptRoutes);

	app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Route not found'), 404));

	app.onError((error, c) => {
		if (error instanceof RateLimitedError) {
			c.var.logger.warn('rate_limit.exceeded', { rules: error.ruleNames, method: c.req.method, path: c.req.path });
			c.header('Retry-After', String(error.retryAfterSeconds));
		}
		if (error instanceof AppError) {
			return c.json(errorBody(error.code, error.message), error.status);
		}
		c.var.logger.error('request.unhandled_error', { error, method: c.req.method, path: c.req.path });
		return c.json(errorBody('INTERNAL_ERROR', 'Something went wrong'), 500);
	});

	return app;
}
