import { describe, expect, it } from 'vitest';
import { MAX_NINES_PER_CLUB } from '../../../src/features/courses/validation';
import { createVerifiedUser } from '../../helpers';
import { addClubStaff, data, errorCode, setUpClub } from '../memberships/helpers';
import { createNine, createNineOrFail, createRoute, dailyRules, generateTeeSheet, type Nine, type Route, setRules } from './helpers';

describe('nines', () => {
	it('lets an owner add nines that anyone can list in display order', async () => {
		const setup = await setUpClub();
		const white = await data<Nine>(await createNine(setup, setup.owner, { name: 'White', sortOrder: 2, turnMinutes: 140 }));
		const red = await data<Nine>(await createNine(setup, setup.owner, { name: 'Red', sortOrder: 1 }));

		const listed = await data<Nine[]>(await setup.client.request(`/api/orgs/${setup.slug}/nines`));

		expect(listed).toEqual([red, white]);
		expect(white).toEqual({ id: expect.any(String), name: 'White', sortOrder: 2, turnMinutes: 140 });
		expect(red.turnMinutes).toBe(135);
	});

	it('lets admins manage nines but not front-desk staff or outsiders', async () => {
		const setup = await setUpClub();
		const admin = await addClubStaff(setup, 'admin');
		const staff = await addClubStaff(setup, 'staff');
		const outsider = await createVerifiedUser(setup.client, 'Outsider');

		expect((await createNine(setup, admin, { name: 'Front' })).status).toBe(201);
		expect((await createNine(setup, staff, { name: 'Back' })).status).toBe(403);
		expect((await createNine(setup, outsider, { name: 'Back' })).status).toBe(403);
	});

	it.each([
		['an empty name', { name: '' }],
		['a turn time under 30 minutes', { name: 'Front', turnMinutes: 29 }],
		['a turn time over 5 hours', { name: 'Front', turnMinutes: 301 }],
	])('rejects %s', async (_label, body) => {
		const setup = await setUpClub();

		expect((await createNine(setup, setup.owner, body)).status).toBe(400);
	});

	it('caps how many nines a club can have', async () => {
		const setup = await setUpClub();
		for (let index = 0; index < MAX_NINES_PER_CLUB; index++) await createNineOrFail(setup, `Nine ${index}`);

		const response = await createNine(setup, setup.owner, { name: 'One Too Many' });

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('LIMIT_REACHED');
	});

	it('rejects a duplicate nine name at the same club', async () => {
		const setup = await setUpClub();
		await createNineOrFail(setup, 'Front');

		const response = await createNine(setup, setup.owner, { name: 'Front' });

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('NINE_NAME_TAKEN');
	});

	it('updates a nine’s name, order and turn time', async () => {
		const setup = await setUpClub();
		const nine = await createNineOrFail(setup, 'Front');

		const response = await setup.client.request(`/api/orgs/${setup.slug}/nines/${nine.id}`, {
			method: 'PATCH',
			cookie: setup.owner.cookie,
			json: { name: 'Lakes', sortOrder: 5, turnMinutes: 150 },
		});

		expect(await data<Nine>(response)).toEqual({ id: nine.id, name: 'Lakes', sortOrder: 5, turnMinutes: 150 });
	});

	it('deletes an unused nine but not one used by a route or with tee times', async () => {
		const setup = await setUpClub();
		const unused = await createNineOrFail(setup, 'Unused');
		const inRoute = await createNineOrFail(setup, 'In Route');
		const partner = await createNineOrFail(setup, 'Partner');
		const scheduled = await createNineOrFail(setup, 'Scheduled');
		await createRoute(setup, setup.owner, { name: 'Loop', nineIds: [inRoute.id, partner.id] });
		await setRules(setup, setup.owner, scheduled.id, dailyRules('07:00', '07:00'));
		await generateTeeSheet(setup, setup.owner, { fromDate: '2026-10-01', toDate: '2026-10-01' });

		const deleteNine = (nineId: string) =>
			setup.client.request(`/api/orgs/${setup.slug}/nines/${nineId}`, { method: 'DELETE', cookie: setup.owner.cookie });

		expect((await deleteNine(unused.id)).status).toBe(200);
		for (const nine of [inRoute, scheduled]) {
			const response = await deleteNine(nine.id);
			expect(response.status).toBe(409);
			expect(await errorCode(response)).toBe('NINE_IN_USE');
		}
	});
});

describe('routes', () => {
	it('creates an 18-hole route from two nines and lists it', async () => {
		const setup = await setUpClub();
		const red = await createNineOrFail(setup, 'Red');
		const white = await createNineOrFail(setup, 'White');

		const response = await createRoute(setup, setup.owner, { name: 'Red/White', nineIds: [red.id, white.id] });

		expect(response.status).toBe(201);
		const route = await data<Route>(response);
		expect(route.name).toBe('Red/White');
		expect(route.nines.map((nine) => nine.name).sort()).toEqual(['Red', 'White']);
		const listed = await data<Route[]>(await setup.client.request(`/api/orgs/${setup.slug}/routes`));
		expect(listed).toEqual([route]);
	});

	it('supports a 27-hole facility with three routes', async () => {
		const setup = await setUpClub();
		const [red, white, blue] = [
			await createNineOrFail(setup, 'Red'),
			await createNineOrFail(setup, 'White'),
			await createNineOrFail(setup, 'Blue'),
		];

		for (const [name, nineIds] of [
			['Red/White', [red.id, white.id]],
			['White/Blue', [white.id, blue.id]],
			['Blue/Red', [blue.id, red.id]],
		] as const) {
			expect((await createRoute(setup, setup.owner, { name, nineIds: [...nineIds] })).status).toBe(201);
		}

		expect(await data<Route[]>(await setup.client.request(`/api/orgs/${setup.slug}/routes`))).toHaveLength(3);
	});

	it('treats the same two nines in either order as the same route', async () => {
		const setup = await setUpClub();
		const red = await createNineOrFail(setup, 'Red');
		const white = await createNineOrFail(setup, 'White');
		await createRoute(setup, setup.owner, { name: 'Red/White', nineIds: [red.id, white.id] });

		const response = await createRoute(setup, setup.owner, { name: 'White/Red', nineIds: [white.id, red.id] });

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('ROUTE_EXISTS');
	});

	it('rejects a route that uses the same nine twice or a different number of nines', async () => {
		const setup = await setUpClub();
		const red = await createNineOrFail(setup, 'Red');
		const white = await createNineOrFail(setup, 'White');
		const blue = await createNineOrFail(setup, 'Blue');

		expect((await createRoute(setup, setup.owner, { name: 'Red/Red', nineIds: [red.id, red.id] })).status).toBe(400);
		expect((await createRoute(setup, setup.owner, { name: 'Just Red', nineIds: [red.id] })).status).toBe(400);
		expect((await createRoute(setup, setup.owner, { name: 'All', nineIds: [red.id, white.id, blue.id] })).status).toBe(400);
	});

	it('rejects a nine from another club', async () => {
		const setup = await setUpClub();
		const otherClub = await setUpClub('Other Club');
		const red = await createNineOrFail(setup, 'Red');
		const foreign = await createNineOrFail(otherClub, 'Foreign');

		const response = await createRoute(setup, setup.owner, { name: 'Mixed', nineIds: [red.id, foreign.id] });

		expect(response.status).toBe(404);
	});

	it('renames and deletes a route, and only club managers can', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const red = await createNineOrFail(setup, 'Red');
		const white = await createNineOrFail(setup, 'White');
		const route = await data<Route>(await createRoute(setup, setup.owner, { name: 'Red/White', nineIds: [red.id, white.id] }));
		const routeUrl = `/api/orgs/${setup.slug}/routes/${route.id}`;

		expect((await setup.client.request(routeUrl, { method: 'PATCH', cookie: staff.cookie, json: { name: 'Nope' } })).status).toBe(403);
		const renamed = await setup.client.request(routeUrl, { method: 'PATCH', cookie: setup.owner.cookie, json: { name: 'Championship' } });
		expect((await data<Route>(renamed)).name).toBe('Championship');
		expect((await setup.client.request(routeUrl, { method: 'DELETE', cookie: setup.owner.cookie })).status).toBe(200);
		expect(await data<Route[]>(await setup.client.request(`/api/orgs/${setup.slug}/routes`))).toEqual([]);
	});
});
