import type { Context } from 'hono';
import type { AppEnv } from '../../app-env';
import { appOrigin } from '../../config/env';
import { createInviteRepository } from './invite-repository';
import { createInviteService, type InviteService } from './invite-service';
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
		appOrigin: appOrigin(c.var.config),
	});
}
