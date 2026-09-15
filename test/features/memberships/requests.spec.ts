import { describe, expect, it } from 'vitest';
import { createVerifiedUser } from '../../helpers';
import {
	addClubStaff,
	approveMembership,
	createMember,
	createTierOrFail,
	data,
	denyMembership,
	errorCode,
	FAR_FUTURE,
	listMemberships,
	LONG_AGO,
	type MembershipView,
	myMembership,
	requestMembership,
	setUpClub,
	updateMembership,
} from './helpers';

describe('requesting membership', () => {
	it('creates a pending request that staff can see', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup, 'Full');
		const golfer = await createVerifiedUser(setup.client, 'Jack');

		const response = await requestMembership(setup, golfer, { requestedTierId: tier.id, note: 'Member #1234 at my old club' });

		expect(response.status).toBe(201);
		const request = await data<MembershipView>(response);
		expect(request).toMatchObject({
			status: 'pending',
			state: 'pending',
			user: { id: golfer.userId, name: 'Jack', email: golfer.email },
			tier: null,
			requestedTier: { id: tier.id, name: 'Full' },
			requestNote: 'Member #1234 at my old club',
		});
		const pending = await data<MembershipView[]>(await listMemberships(setup, setup.owner, 'pending'));
		expect(pending.map((membership) => membership.id)).toEqual([request.id]);
	});

	it('requires a signed-in golfer', async () => {
		const setup = await setUpClub();

		const response = await setup.client.request(`/api/orgs/${setup.slug}/membership-requests`, { method: 'POST', json: {} });

		expect(response.status).toBe(401);
	});

	it('rejects a second request while one is pending', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		await requestMembership(setup, golfer);

		const response = await requestMembership(setup, golfer);

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('REQUEST_PENDING');
	});

	it('rejects a request from someone who is already a member', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { golfer } = await createMember(setup, tier);

		const response = await requestMembership(setup, golfer);

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('ALREADY_MEMBER');
	});

	it('rejects a requested tier from another club', async () => {
		const setup = await setUpClub();
		const otherClub = await setUpClub('Other Club');
		const otherTier = await createTierOrFail(otherClub, 'Full');
		const golfer = await createVerifiedUser(setup.client, 'Jack');

		const response = await requestMembership(setup, golfer, { requestedTierId: otherTier.id });

		expect(response.status).toBe(404);
	});
});

describe('approving and denying requests', () => {
	it('lets front-desk staff approve a request with a tier, dates and member number', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const tier = await createTierOrFail(setup, 'Full', 14);
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		const response = await approveMembership(setup, staff, request.id, {
			tierId: tier.id,
			startsOn: LONG_AGO,
			endsOn: FAR_FUTURE,
			memberNumber: 'M-100',
		});

		expect(response.status).toBe(200);
		expect(await data<MembershipView>(response)).toMatchObject({
			status: 'active',
			state: 'active',
			tier: { id: tier.id, name: 'Full', bookingWindowDays: 14 },
			startsOn: LONG_AGO,
			endsOn: FAR_FUTURE,
			memberNumber: 'M-100',
			decidedAt: expect.any(String),
		});
		const email = setup.client.outbox.findLast((message) => message.to === golfer.email);
		expect(email?.subject).toMatch(/approved/i);
	});

	it('lets staff deny a request and emails the golfer', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		const response = await denyMembership(setup, setup.owner, request.id, { reason: 'Membership is full this season' });

		expect(response.status).toBe(200);
		expect((await data<MembershipView>(response)).status).toBe('denied');
		const email = setup.client.outbox.findLast((message) => message.to === golfer.email);
		expect(email?.text).toContain('Membership is full this season');
	});

	it('lets a denied golfer request again', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));
		await denyMembership(setup, setup.owner, request.id);

		const again = await requestMembership(setup, golfer, { note: 'Trying again' });

		expect(again.status).toBe(201);
		expect(await data<MembershipView>(again)).toMatchObject({ id: request.id, status: 'pending', requestNote: 'Trying again' });
	});

	it('only approves or denies pending requests', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { membership } = await createMember(setup, tier);

		const approveAgain = await approveMembership(setup, setup.owner, membership.id, { tierId: tier.id, startsOn: LONG_AGO });
		const deny = await denyMembership(setup, setup.owner, membership.id);

		expect(approveAgain.status).toBe(409);
		expect(await errorCode(approveAgain)).toBe('INVALID_STATUS');
		expect(deny.status).toBe(409);
	});

	it('rejects an end date before the start date', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		const response = await approveMembership(setup, setup.owner, request.id, {
			tierId: tier.id,
			startsOn: '2026-06-01',
			endsOn: '2026-05-31',
		});

		expect(response.status).toBe(400);
	});

	it('rejects an invalid calendar date', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		const response = await approveMembership(setup, setup.owner, request.id, { tierId: tier.id, startsOn: '2026-02-30' });

		expect(response.status).toBe(400);
	});

	it('keeps member numbers unique within a club', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		await createMember(setup, tier, { memberNumber: 'M-7' });
		const golfer = await createVerifiedUser(setup.client, 'Second');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		const response = await approveMembership(setup, setup.owner, request.id, { tierId: tier.id, startsOn: LONG_AGO, memberNumber: 'M-7' });

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('MEMBER_NUMBER_TAKEN');
	});

	it('does not let golfers who are not staff see or decide requests', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		expect((await listMemberships(setup, golfer)).status).toBe(403);
		expect((await approveMembership(setup, golfer, request.id, { tierId: tier.id, startsOn: LONG_AGO })).status).toBe(403);
	});
});

describe('managing memberships', () => {
	it('suspends, reinstates and cancels a membership', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { golfer, membership } = await createMember(setup, tier);

		expect((await updateMembership(setup, setup.owner, membership.id, { status: 'suspended' })).status).toBe(200);
		expect((await myMembership(setup, golfer)).state).toBe('suspended');

		expect((await updateMembership(setup, setup.owner, membership.id, { status: 'active' })).status).toBe(200);
		expect((await myMembership(setup, golfer)).state).toBe('active');

		expect((await updateMembership(setup, setup.owner, membership.id, { status: 'cancelled' })).status).toBe(200);
		expect((await myMembership(setup, golfer)).state).toBe('cancelled');
	});

	it('changes tier and clears the end date', async () => {
		const setup = await setUpClub();
		const full = await createTierOrFail(setup, 'Full', 14);
		const weekday = await createTierOrFail(setup, 'Weekday', 7);
		const { membership } = await createMember(setup, full, { endsOn: '2000-12-31' });

		const response = await updateMembership(setup, setup.owner, membership.id, { tierId: weekday.id, endsOn: null });

		expect(await data<MembershipView>(response)).toMatchObject({ tier: { name: 'Weekday' }, endsOn: null, state: 'active' });
	});

	it('rejects an update that would put the end date before the start date', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { membership } = await createMember(setup, tier, { startsOn: '2026-06-01' });

		const response = await updateMembership(setup, setup.owner, membership.id, { endsOn: '2026-05-01' });

		expect(response.status).toBe(400);
	});

	it('does not manage pending or denied requests through updates', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		const response = await updateMembership(setup, setup.owner, request.id, { status: 'active' });

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('INVALID_STATUS');
	});

	it('rejects statuses that are only set by the request flow', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { membership } = await createMember(setup, tier);

		expect((await updateMembership(setup, setup.owner, membership.id, { status: 'pending' })).status).toBe(400);
	});

	it('cannot manage another club’s membership through its own club address', async () => {
		const clubA = await setUpClub('Club A');
		const clubB = await setUpClub('Club B');
		const tierB = await createTierOrFail(clubB);
		const { membership } = await createMember(clubB, tierB);

		const response = await updateMembership(clubA, clubA.owner, membership.id, { status: 'cancelled' });

		expect(response.status).toBe(404);
	});
});

describe('GET memberships/me', () => {
	it('gives non-members the public booking window', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Visitor');

		const mine = await myMembership(setup, golfer);

		expect(mine).toEqual({ membership: null, state: 'none', bookingWindowDays: 7 });
	});

	it('gives active members their tier’s booking window', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup, 'Full', 21);
		const { golfer } = await createMember(setup, tier);

		const mine = await myMembership(setup, golfer);

		expect(mine.state).toBe('active');
		expect(mine.bookingWindowDays).toBe(21);
	});

	it('falls back to the public window before a membership starts and after it ends', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup, 'Full', 21);
		const { golfer: future } = await createMember(setup, tier, { name: 'Future', startsOn: FAR_FUTURE });
		const { golfer: lapsed } = await createMember(setup, tier, { name: 'Lapsed', startsOn: LONG_AGO, endsOn: '2000-12-31' });

		expect(await myMembership(setup, future)).toMatchObject({ state: 'not_started', bookingWindowDays: 7 });
		expect(await myMembership(setup, lapsed)).toMatchObject({ state: 'expired', bookingWindowDays: 7 });
	});

	it('only shows a golfer their own membership at that club', async () => {
		const clubA = await setUpClub('Club A');
		const clubB = await setUpClub('Club B');
		const tierA = await createTierOrFail(clubA, 'Full', 21);
		const { golfer } = await createMember(clubA, tierA);

		const atClubB = await clubB.client.request(`/api/orgs/${clubB.slug}/memberships/me`, { cookie: golfer.cookie });

		expect((await data<{ state: string }>(atClubB)).state).toBe('none');
	});
});
