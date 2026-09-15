import { notFound } from '../../lib/errors';
import type { TierRepository } from '../memberships/tier-repository';
import { loadClub, requireClubManager } from '../organizations/club-access';
import type { OrganizationRepository } from '../organizations/repository';
import type { Rate, RateRepository } from './repository';
import type { SetRateInput } from './validation';

interface RateServiceDependencies {
	organizations: OrganizationRepository;
	tiers: TierRepository;
	rates: RateRepository;
}

export interface RateService {
	list(slug: string): Promise<Rate[]>;
	set(slug: string, actorUserId: string, input: SetRateInput): Promise<Rate>;
	remove(slug: string, actorUserId: string, rateId: string): Promise<void>;
}

export function createRateService({ organizations, tiers, rates }: RateServiceDependencies): RateService {
	return {
		async list(slug) {
			const club = await loadClub(organizations, slug);
			return rates.list(club.id);
		},

		async set(slug, actorUserId, { holes, audience, tierId, dayType, amountCents }) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			if (tierId && !(await tiers.findInClub(club.id, tierId))) throw notFound('Membership tier not found');

			const rateId = await rates.upsert(club.id, { holes, audience, tierId: tierId ?? null, dayType }, amountCents);
			const saved = (await rates.list(club.id)).find((rate) => rate.id === rateId);
			if (!saved) throw notFound('Rate not found');
			return saved;
		},

		async remove(slug, actorUserId, rateId) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			if (!(await rates.delete(club.id, rateId))) throw notFound('Rate not found');
		},
	};
}
