import { describe, expect, it } from 'vitest';
import { createVerifiedUser } from '../../helpers';
import { addClubStaff, data, setUpClub } from '../memberships/helpers';

interface ClubDetails {
	slug: string;
	publicBookingWindowDays: number;
}

const DEFAULT_PUBLIC_BOOKING_WINDOW_DAYS = 7;

describe('club booking settings', () => {
	it('starts every club with a default public booking window', async () => {
		const setup = await setUpClub();

		const club = await data<ClubDetails>(await setup.client.request(`/api/orgs/${setup.slug}`));

		expect(club.publicBookingWindowDays).toBe(DEFAULT_PUBLIC_BOOKING_WINDOW_DAYS);
	});

	it('lets owners and admins change how far ahead non-members can book', async () => {
		const setup = await setUpClub();
		const admin = await addClubStaff(setup, 'admin');

		const response = await setup.client.request(`/api/orgs/${setup.slug}/settings`, {
			method: 'PATCH',
			cookie: admin.cookie,
			json: { publicBookingWindowDays: 3 },
		});

		expect(response.status).toBe(200);
		const club = await data<ClubDetails>(await setup.client.request(`/api/orgs/${setup.slug}`));
		expect(club.publicBookingWindowDays).toBe(3);
	});

	it('does not let front-desk staff or outsiders change settings', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const outsider = await createVerifiedUser(setup.client, 'Outsider');

		for (const actor of [staff, outsider]) {
			const response = await setup.client.request(`/api/orgs/${setup.slug}/settings`, {
				method: 'PATCH',
				cookie: actor.cookie,
				json: { publicBookingWindowDays: 30 },
			});
			expect(response.status).toBe(403);
		}
	});

	it('defaults the cancellation cutoff to 24 hours and lets managers change it', async () => {
		const setup = await setUpClub();
		expect(
			(await data<{ cancellationCutoffHours: number }>(await setup.client.request(`/api/orgs/${setup.slug}`))).cancellationCutoffHours,
		).toBe(24);

		const response = await setup.client.request(`/api/orgs/${setup.slug}/settings`, {
			method: 'PATCH',
			cookie: setup.owner.cookie,
			json: { cancellationCutoffHours: 48 },
		});

		expect((await data<{ cancellationCutoffHours: number; publicBookingWindowDays: number }>(response)).cancellationCutoffHours).toBe(48);
		expect(
			(
				await setup.client.request(`/api/orgs/${setup.slug}/settings`, {
					method: 'PATCH',
					cookie: setup.owner.cookie,
					json: { cancellationCutoffHours: 169 },
				})
			).status,
		).toBe(400);
		expect(
			(await setup.client.request(`/api/orgs/${setup.slug}/settings`, { method: 'PATCH', cookie: setup.owner.cookie, json: {} })).status,
		).toBe(400);
	});

	it.each([[-1], [366], [2.5]])('rejects a booking window of %s days', async (days) => {
		const setup = await setUpClub();

		const response = await setup.client.request(`/api/orgs/${setup.slug}/settings`, {
			method: 'PATCH',
			cookie: setup.owner.cookie,
			json: { publicBookingWindowDays: days },
		});

		expect(response.status).toBe(400);
	});
});
