import { describe, expect, it } from 'vitest';
import { createVerifiedUser } from '../../helpers';
import { addClubStaff, createMember, createTier, createTierOrFail, data, errorCode, setUpClub, type Tier } from './helpers';

describe('membership tiers', () => {
	it('lets an owner create tiers that anyone can list', async () => {
		const setup = await setUpClub();

		const full = await createTierOrFail(setup, 'Full', 14);
		const weekday = await createTierOrFail(setup, 'Weekday', 7);

		const listed = await data<Tier[]>(await setup.client.request(`/api/orgs/${setup.slug}/membership-tiers`));
		expect(listed).toEqual([full, weekday]);
		expect(full).toEqual({ id: expect.any(String), name: 'Full', bookingWindowDays: 14 });
	});

	it('lets an admin create tiers but not front-desk staff', async () => {
		const setup = await setUpClub();
		const admin = await addClubStaff(setup, 'admin');
		const staff = await addClubStaff(setup, 'staff');

		expect((await createTier(setup, admin, { name: 'Junior', bookingWindowDays: 7 })).status).toBe(201);
		expect((await createTier(setup, staff, { name: 'Senior', bookingWindowDays: 7 })).status).toBe(403);
	});

	it('rejects a duplicate tier name within the same club', async () => {
		const setup = await setUpClub();
		await createTierOrFail(setup, 'Full');

		const response = await createTier(setup, setup.owner, { name: 'Full', bookingWindowDays: 10 });

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('TIER_NAME_TAKEN');
	});

	it.each([
		['an empty name', { name: '', bookingWindowDays: 7 }],
		['a negative window', { name: 'Full', bookingWindowDays: -1 }],
		['a window over a year', { name: 'Full', bookingWindowDays: 366 }],
	])('rejects %s', async (_label, body) => {
		const setup = await setUpClub();

		expect((await createTier(setup, setup.owner, body)).status).toBe(400);
	});

	it('lets an owner rename a tier and change its booking window', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup, 'Full', 14);

		const response = await setup.client.request(`/api/orgs/${setup.slug}/membership-tiers/${tier.id}`, {
			method: 'PATCH',
			cookie: setup.owner.cookie,
			json: { name: 'Gold', bookingWindowDays: 21 },
		});

		expect(response.status).toBe(200);
		expect(await data<Tier>(response)).toEqual({ id: tier.id, name: 'Gold', bookingWindowDays: 21 });
	});

	it('deletes an unused tier but refuses to delete one that members hold', async () => {
		const setup = await setUpClub();
		const unused = await createTierOrFail(setup, 'Unused');
		const held = await createTierOrFail(setup, 'Held');
		await createMember(setup, held);

		const deleteTier = (tierId: string) =>
			setup.client.request(`/api/orgs/${setup.slug}/membership-tiers/${tierId}`, { method: 'DELETE', cookie: setup.owner.cookie });

		expect((await deleteTier(unused.id)).status).toBe(200);
		const inUse = await deleteTier(held.id);
		expect(inUse.status).toBe(409);
		expect(await errorCode(inUse)).toBe('TIER_IN_USE');
	});

	it('cannot change another club’s tier through its own club address', async () => {
		const clubA = await setUpClub('Club A');
		const clubB = await setUpClub('Club B');
		const tierB = await createTierOrFail(clubB, 'Full');

		const response = await clubA.client.request(`/api/orgs/${clubA.slug}/membership-tiers/${tierB.id}`, {
			method: 'PATCH',
			cookie: clubA.owner.cookie,
			json: { name: 'Hijacked' },
		});

		expect(response.status).toBe(404);
	});

	it('requires a signed-in club manager to create tiers', async () => {
		const setup = await setUpClub();
		const outsider = await createVerifiedUser(setup.client, 'Outsider');

		expect((await createTier(setup, outsider, { name: 'Full', bookingWindowDays: 7 })).status).toBe(403);
		const signedOut = await setup.client.request(`/api/orgs/${setup.slug}/membership-tiers`, {
			method: 'POST',
			json: { name: 'Full', bookingWindowDays: 7 },
		});
		expect(signedOut.status).toBe(401);
	});
});
