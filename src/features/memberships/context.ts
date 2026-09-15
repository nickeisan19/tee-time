import type { Context } from 'hono';
import type { AppEnv } from '../../app-env';
import { appOrigin } from '../../config/env';
import { createRateLimiter } from '../../lib/rate-limit';
import { createOrganizationRepository } from '../organizations/repository';
import { createMembershipInviteRepository } from './membership-invite-repository';
import { createMembershipInviteService, type MembershipInviteService } from './membership-invite-service';
import { createMembershipRepository } from './membership-repository';
import { createMembershipService, type MembershipService } from './membership-service';
import { createTierRepository } from './tier-repository';
import { createTierService, type TierService } from './tier-service';

export function tierServiceFor(c: Context<AppEnv>): TierService {
	return createTierService({
		organizations: createOrganizationRepository(c.var.db),
		tiers: createTierRepository(c.var.db),
	});
}

export function membershipServiceFor(c: Context<AppEnv>): MembershipService {
	return createMembershipService({
		organizations: createOrganizationRepository(c.var.db),
		tiers: createTierRepository(c.var.db),
		memberships: createMembershipRepository(c.var.db),
		emailSender: c.var.emailSender,
		rateLimiter: createRateLimiter(c.var.db, c.var.config.authSecret),
	});
}

export function membershipInviteServiceFor(c: Context<AppEnv>): MembershipInviteService {
	return createMembershipInviteService({
		organizations: createOrganizationRepository(c.var.db),
		tiers: createTierRepository(c.var.db),
		memberships: createMembershipRepository(c.var.db),
		invites: createMembershipInviteRepository(c.var.db),
		emailSender: c.var.emailSender,
		rateLimiter: createRateLimiter(c.var.db, c.var.config.authSecret),
		appOrigin: appOrigin(c.var.config),
	});
}
