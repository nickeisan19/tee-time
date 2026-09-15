import { describe, expect, it } from 'vitest';
import { addClubStaff, createMember, createTierOrFail, data, errorCode, setUpClub } from '../memberships/helpers';

interface Rate {
	id: string;
	holes: number;
	audience: string;
	tier: { id: string; name: string } | null;
	dayType: string;
	amountCents: number;
}

type RateBody = { holes: number; audience: string; tierId?: string; dayType: string; amountCents: number };

async function setRate({ client, slug }: Awaited<ReturnType<typeof setUpClub>>, cookie: string, body: RateBody) {
	return client.request(`/api/orgs/${slug}/rates`, { method: 'PUT', cookie, json: body });
}

async function listRates({ client, slug }: Awaited<ReturnType<typeof setUpClub>>) {
	return data<Rate[]>(await client.request(`/api/orgs/${slug}/rates`));
}

describe('rates', () => {
	it('lets an owner set public, member and member-guest rates that anyone can view', async () => {
		const setup = await setUpClub();
		const gold = await createTierOrFail(setup, 'Gold');

		expect(
			(await setRate(setup, setup.owner.cookie, { holes: 18, audience: 'public', dayType: 'weekend', amountCents: 8500 })).status,
		).toBe(200);
		expect(
			(
				await setRate(setup, setup.owner.cookie, {
					holes: 18,
					audience: 'member_guest',
					tierId: gold.id,
					dayType: 'weekend',
					amountCents: 4000,
				})
			).status,
		).toBe(200);

		expect(await listRates(setup)).toEqual([
			{
				id: expect.any(String),
				holes: 18,
				audience: 'member_guest',
				tier: { id: gold.id, name: 'Gold' },
				dayType: 'weekend',
				amountCents: 4000,
			},
			{ id: expect.any(String), holes: 18, audience: 'public', tier: null, dayType: 'weekend', amountCents: 8500 },
		]);
	});

	it('updates the price when the same rate is set again instead of adding a duplicate', async () => {
		const setup = await setUpClub();
		await setRate(setup, setup.owner.cookie, { holes: 9, audience: 'public', dayType: 'weekday', amountCents: 3000 });

		const response = await setRate(setup, setup.owner.cookie, { holes: 9, audience: 'public', dayType: 'weekday', amountCents: 3500 });

		expect((await data<Rate>(response)).amountCents).toBe(3500);
		expect(await listRates(setup)).toMatchObject([{ holes: 9, audience: 'public', amountCents: 3500 }]);
	});

	it('updates a tier’s rate when it is set again', async () => {
		const setup = await setUpClub();
		const gold = await createTierOrFail(setup, 'Gold');
		const body = { holes: 18, audience: 'member_guest', tierId: gold.id, dayType: 'weekday', amountCents: 4000 };
		await setRate(setup, setup.owner.cookie, body);

		const response = await setRate(setup, setup.owner.cookie, { ...body, amountCents: 4500 });

		expect(response.status).toBe(200);
		expect(await listRates(setup)).toMatchObject([{ audience: 'member_guest', tier: { id: gold.id }, amountCents: 4500 }]);
	});

	it.each([
		['a member rate without a tier', { holes: 18, audience: 'member', dayType: 'weekday', amountCents: 0 }],
		['a public rate with a tier', { holes: 18, audience: 'public', tierId: 'any', dayType: 'weekday', amountCents: 100 }],
		['27 holes', { holes: 27, audience: 'public', dayType: 'weekday', amountCents: 100 }],
		['a negative price', { holes: 18, audience: 'public', dayType: 'weekday', amountCents: -1 }],
		['a fractional price', { holes: 18, audience: 'public', dayType: 'weekday', amountCents: 10.5 }],
		['an unknown day type', { holes: 18, audience: 'public', dayType: 'holiday', amountCents: 100 }],
	])('rejects %s', async (_label, body) => {
		const setup = await setUpClub();

		expect((await setRate(setup, setup.owner.cookie, body)).status).toBe(400);
	});

	it('rejects a tier from another club', async () => {
		const setup = await setUpClub();
		const otherClub = await setUpClub('Other');
		const foreignTier = await createTierOrFail(otherClub, 'Gold');

		const response = await setRate(setup, setup.owner.cookie, {
			holes: 18,
			audience: 'member',
			tierId: foreignTier.id,
			dayType: 'weekday',
			amountCents: 0,
		});

		expect(response.status).toBe(404);
	});

	it('only lets club managers set and delete rates', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const rate = await data<Rate>(
			await setRate(setup, setup.owner.cookie, { holes: 18, audience: 'public', dayType: 'weekday', amountCents: 6500 }),
		);

		expect((await setRate(setup, staff.cookie, { holes: 18, audience: 'public', dayType: 'weekday', amountCents: 1 })).status).toBe(403);
		const rateUrl = `/api/orgs/${setup.slug}/rates/${rate.id}`;
		expect((await setup.client.request(rateUrl, { method: 'DELETE', cookie: staff.cookie })).status).toBe(403);
		expect((await setup.client.request(rateUrl, { method: 'DELETE', cookie: setup.owner.cookie })).status).toBe(200);
		expect(await listRates(setup)).toEqual([]);
	});

	it('removes a tier’s rates when the tier is deleted, but still refuses to delete a tier members hold', async () => {
		const setup = await setUpClub();
		const unused = await createTierOrFail(setup, 'Unused');
		const held = await createTierOrFail(setup, 'Held');
		await createMember(setup, held);
		await setRate(setup, setup.owner.cookie, { holes: 18, audience: 'member', tierId: unused.id, dayType: 'weekday', amountCents: 0 });
		await setRate(setup, setup.owner.cookie, { holes: 18, audience: 'member', tierId: held.id, dayType: 'weekday', amountCents: 0 });

		const deleteTier = (tierId: string) =>
			setup.client.request(`/api/orgs/${setup.slug}/membership-tiers/${tierId}`, { method: 'DELETE', cookie: setup.owner.cookie });

		expect((await deleteTier(unused.id)).status).toBe(200);
		const heldResponse = await deleteTier(held.id);
		expect(heldResponse.status).toBe(409);
		expect(await errorCode(heldResponse)).toBe('TIER_IN_USE');
		expect((await listRates(setup)).map((rate) => rate.tier?.name)).toEqual(['Held']);
	});
});
