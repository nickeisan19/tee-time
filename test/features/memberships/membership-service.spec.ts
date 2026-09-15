import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../../src/db/client';
import { createMembershipRepository } from '../../../src/features/memberships/membership-repository';
import { createMembershipService } from '../../../src/features/memberships/membership-service';
import { createTierRepository, type TierRepository } from '../../../src/features/memberships/tier-repository';
import { createOrganizationRepository } from '../../../src/features/organizations/repository';
import { createVerifiedUser } from '../../helpers';
import { createMember, createTierOrFail, data, LONG_AGO, type MembershipView, requestMembership, setUpClub } from './helpers';

const db = createDb(env.DB);

/** Simulates a tier that passed the "tier exists" check but was deleted before the membership write. */
function tiersWithVanishedTier(): TierRepository {
	return {
		...createTierRepository(db),
		findInClub: async () => ({ id: 'tier-deleted-mid-request', name: 'Vanished', bookingWindowDays: 7 }),
	};
}

function serviceWith(tiers: TierRepository) {
	return createMembershipService({
		organizations: createOrganizationRepository(db),
		tiers,
		memberships: createMembershipRepository(db),
		emailSender: { send: async () => {} },
	});
}

describe('membership writes racing a tier deletion', () => {
	it('reports a tier deleted mid-approval as not found instead of a server error', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		const approval = serviceWith(tiersWithVanishedTier()).approve(setup.slug, setup.owner.userId, request.id, {
			tierId: 'tier-deleted-mid-request',
			startsOn: LONG_AGO,
		});

		await expect(approval).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
	});

	it('reports a tier deleted mid-update as not found instead of a server error', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { membership } = await createMember(setup, tier);

		const update = serviceWith(tiersWithVanishedTier()).update(setup.slug, setup.owner.userId, membership.id, {
			tierId: 'tier-deleted-mid-request',
		});

		await expect(update).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
	});
});
