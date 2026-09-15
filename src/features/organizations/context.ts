import type { Context } from 'hono';
import type { AppEnv } from '../../app-env';
import { appOrigin } from '../../config/env';
import { createRateLimiter } from '../../lib/rate-limit';
import { createInviteRepository } from './invite-repository';
import { createInviteService, type InviteService } from './invite-service';
import { createLogoService, type LogoService } from './logo-service';
import { createOrganizationRepository } from './repository';
import { createOrganizationService, type OrganizationService } from './service';

export function organizationServiceFor(c: Context<AppEnv>): OrganizationService {
	return createOrganizationService({ organizations: createOrganizationRepository(c.var.db) });
}

export function inviteServiceFor(c: Context<AppEnv>): InviteService {
	return createInviteService({
		organizations: createOrganizationRepository(c.var.db),
		invites: createInviteRepository(c.var.db),
		emailSender: c.var.emailSender,
		rateLimiter: createRateLimiter(c.var.db, c.var.config.authSecret),
		appOrigin: appOrigin(c.var.config),
	});
}

export function logoServiceFor(c: Context<AppEnv>): LogoService {
	return createLogoService({
		organizations: createOrganizationRepository(c.var.db),
		bucket: c.env.LOGOS,
		rateLimiter: createRateLimiter(c.var.db, c.var.config.authSecret),
	});
}
