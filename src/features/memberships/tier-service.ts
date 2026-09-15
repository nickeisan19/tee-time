import { isUniqueViolation } from '../../db/errors';
import { conflict, notFound } from '../../lib/errors';
import { loadClub, requireClubManager } from '../organizations/club-access';
import type { OrganizationRepository } from '../organizations/repository';
import type { Tier, TierRepository } from './tier-repository';
import type { CreateTierInput, UpdateTierInput } from './validation';

interface TierServiceDependencies {
	organizations: OrganizationRepository;
	tiers: TierRepository;
}

export interface TierService {
	list(slug: string): Promise<Tier[]>;
	create(slug: string, actorUserId: string, input: CreateTierInput): Promise<Tier>;
	update(slug: string, actorUserId: string, tierId: string, patch: UpdateTierInput): Promise<Tier>;
	remove(slug: string, actorUserId: string, tierId: string): Promise<void>;
}

const TIER_NAME_TAKEN_MESSAGE = 'This club already has a tier with that name';

function rethrowTierNameTaken(error: unknown): never {
	if (isUniqueViolation(error, 'membership_tiers.org_id')) throw conflict('TIER_NAME_TAKEN', TIER_NAME_TAKEN_MESSAGE);
	throw error;
}

export function createTierService({ organizations, tiers }: TierServiceDependencies): TierService {
	return {
		async list(slug) {
			const club = await loadClub(organizations, slug);
			return tiers.list(club.id);
		},

		async create(slug, actorUserId, input) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			return tiers.create(club.id, input).catch(rethrowTierNameTaken);
		},

		async update(slug, actorUserId, tierId, patch) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			const tier = await tiers.update(club.id, tierId, patch).catch(rethrowTierNameTaken);
			if (!tier) throw notFound('Membership tier not found');
			return tier;
		},

		async remove(slug, actorUserId, tierId) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			const result = await tiers.deleteIfUnused(club.id, tierId);
			if (result === 'in_use') throw conflict('TIER_IN_USE', 'Move members to another tier before deleting this one');
			if (result === 'not_found') throw notFound('Membership tier not found');
		},
	};
}
