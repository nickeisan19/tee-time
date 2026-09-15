import { describe, expect, it } from 'vitest';
import { MEMBERSHIP_REQUEST_RATE_LIMITS } from '../../../src/features/memberships/rate-limits';
import { createClub, createVerifiedUser } from '../../helpers';
import {
	type ClubSetup,
	data,
	errorCode,
	listMemberships,
	type MembershipView,
	requestMembership,
	setUpClub,
	type StaffMembershipView,
} from './helpers';

async function requestAs(setup: ClubSetup, name: string) {
	const golfer = await createVerifiedUser(setup.client, name);
	const membership = await data<MembershipView>(await requestMembership(setup, golfer));
	return { golfer, membership };
}

async function search(setup: ClubSetup, query: string, status?: string): Promise<StaffMembershipView[]> {
	return data<StaffMembershipView[]>(await listMemberships(setup, setup.owner, status, query));
}

describe('searching membership requests', () => {
	it('finds requests by part of a name, ignoring case', async () => {
		const setup = await setUpClub();
		const { membership: jack } = await requestAs(setup, 'Jack Nicklaus');
		await requestAs(setup, 'Arnold Palmer');

		const results = await search(setup, 'nICK');

		expect(results.map((result) => result.id)).toEqual([jack.id]);
	});

	it('finds requests by part of an email address', async () => {
		const setup = await setUpClub();
		const { golfer, membership } = await requestAs(setup, 'Gary Player');
		await requestAs(setup, 'Tom Watson');

		const results = await search(setup, golfer.email.slice(0, 12).toUpperCase());

		expect(results.map((result) => result.id)).toEqual([membership.id]);
	});

	it('combines search with a status filter', async () => {
		const setup = await setUpClub();
		await requestAs(setup, 'Sam Snead');

		expect(await search(setup, 'snead', 'pending')).toHaveLength(1);
		expect(await search(setup, 'snead', 'active')).toHaveLength(0);
	});

	it('treats % and _ in the search as plain characters', async () => {
		const setup = await setUpClub();
		await requestAs(setup, 'Ben Hogan');

		expect(await search(setup, '%')).toEqual([]);
		expect(await search(setup, '_')).toEqual([]);
	});

	it('rejects an overly long search', async () => {
		const setup = await setUpClub();

		expect((await listMemberships(setup, setup.owner, undefined, 'x'.repeat(101))).status).toBe(400);
	});
});

describe('flagging possible duplicate requests', () => {
	it('flags people at the same club who share a name but use different emails', async () => {
		const setup = await setUpClub();
		const { membership: first } = await requestAs(setup, 'John Smith');
		const { membership: second } = await requestAs(setup, '  john SMITH ');
		const { membership: unique } = await requestAs(setup, 'Jane Doe');

		const results = await data<StaffMembershipView[]>(await listMemberships(setup, setup.owner));
		const duplicatesById = new Map(results.map((result) => [result.id, result.possibleDuplicates]));

		expect(duplicatesById.get(first.id)).toBe(1);
		expect(duplicatesById.get(second.id)).toBe(1);
		expect(duplicatesById.get(unique.id)).toBe(0);
	});

	it('does not count people with the same name at other clubs', async () => {
		const clubA = await setUpClub('Club A');
		const clubB = await setUpClub('Club B');
		const { membership } = await requestAs(clubA, 'Lee Trevino');
		await requestAs(clubB, 'Lee Trevino');

		const [result] = await data<StaffMembershipView[]>(await listMemberships(clubA, clubA.owner));

		expect(result).toMatchObject({ id: membership.id, possibleDuplicates: 0 });
	});

	it('does not show duplicate counts to golfers viewing their own membership', async () => {
		const setup = await setUpClub();
		const { golfer } = await requestAs(setup, 'Phil Mickelson');
		await requestAs(setup, 'Phil Mickelson');

		const mine = await setup.client.request(`/api/orgs/${setup.slug}/memberships/me`, { cookie: golfer.cookie });

		expect(JSON.stringify(await mine.json())).not.toContain('possibleDuplicates');
	});
});

describe('membership request rate limits', () => {
	it('limits how many membership requests one golfer can send per hour, across clubs', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Busy Golfer');
		const limit = MEMBERSHIP_REQUEST_RATE_LIMITS.requester.limit;

		for (let clubNumber = 0; clubNumber < limit; clubNumber++) {
			const { slug } = await createClub(setup.client, setup.owner, { name: `Club ${clubNumber}` });
			expect((await requestMembership({ ...setup, slug }, golfer)).status).toBe(201);
		}

		const { slug } = await createClub(setup.client, setup.owner, { name: 'One Too Many' });
		const overLimit = await requestMembership({ ...setup, slug }, golfer);

		expect(overLimit.status).toBe(429);
		expect(await errorCode(overLimit)).toBe('RATE_LIMITED');
	});
});
