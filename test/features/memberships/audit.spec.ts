import { describe, expect, it } from 'vitest';
import { createVerifiedUser } from '../../helpers';
import {
	addClubStaff,
	approveMembership,
	clubMembershipEvents,
	createMember,
	createTierOrFail,
	data,
	denyMembership,
	findMembershipInviteToken,
	LONG_AGO,
	type MembershipEvent,
	membershipEvents,
	type MembershipView,
	requestMembership,
	setUpClub,
	updateMembership,
} from './helpers';

async function eventsFor(setup: Parameters<typeof membershipEvents>[0], membershipId: string): Promise<MembershipEvent[]> {
	return data<MembershipEvent[]>(await membershipEvents(setup, setup.owner, membershipId));
}

describe('membership audit log', () => {
	it('records who requested and who approved, with the tier and dates they set', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup, 'Full');
		const staff = await addClubStaff(setup, 'staff', 'Front Desk');
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer, { note: 'Please' }));
		await approveMembership(setup, staff, request.id, { tierId: tier.id, startsOn: LONG_AGO, memberNumber: 'M-9' });

		const [approved, requested] = await eventsFor(setup, request.id);

		expect(requested).toMatchObject({
			action: 'requested',
			membershipId: request.id,
			member: { id: golfer.userId, name: 'Jack' },
			actor: { id: golfer.userId, name: 'Jack', email: golfer.email },
			note: 'Please',
		});
		expect(approved).toMatchObject({
			action: 'approved',
			actor: { id: staff.userId, name: 'Front Desk', email: staff.email },
			changes: {
				status: { from: 'pending', to: 'active' },
				tier: { from: null, to: { id: tier.id, name: 'Full' } },
				startsOn: { from: null, to: LONG_AGO },
				memberNumber: { from: null, to: 'M-9' },
			},
		});
	});

	it('records a tier change with the old and new tier and the staff member who made it', async () => {
		const setup = await setUpClub();
		const full = await createTierOrFail(setup, 'Full');
		const gold = await createTierOrFail(setup, 'Gold');
		const staff = await addClubStaff(setup, 'staff', 'Front Desk');
		const { membership } = await createMember(setup, full);

		await updateMembership(setup, staff, membership.id, { tierId: gold.id });

		const [latest] = await eventsFor(setup, membership.id);
		expect(latest).toMatchObject({
			action: 'updated',
			actor: { id: staff.userId, name: 'Front Desk' },
			changes: { tier: { from: { id: full.id, name: 'Full' }, to: { id: gold.id, name: 'Gold' } } },
		});
		expect(Object.keys(latest.changes)).toEqual(['tier']);
	});

	it('records a denial with the reason', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));

		await denyMembership(setup, setup.owner, request.id, { reason: 'Waitlist is full' });

		const [denied] = await eventsFor(setup, request.id);
		expect(denied).toMatchObject({
			action: 'denied',
			actor: { id: setup.owner.userId },
			changes: { status: { from: 'pending', to: 'denied' } },
			note: 'Waitlist is full',
		});
	});

	it('records a joined-by-invite event credited to the staff member who sent the invite', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup, 'Full');
		const staff = await addClubStaff(setup, 'staff', 'Front Desk');
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		await setup.client.request(`/api/orgs/${setup.slug}/membership-invites`, {
			method: 'POST',
			cookie: staff.cookie,
			json: { email: golfer.email, tierId: tier.id, startsOn: LONG_AGO },
		});
		const accepted = await setup.client.request('/api/membership-invites/accept', {
			method: 'POST',
			cookie: golfer.cookie,
			json: { token: findMembershipInviteToken(setup.client, golfer.email) },
		});
		const { membership } = await data<{ membership: MembershipView }>(accepted);

		const [joined] = await eventsFor(setup, membership.id);

		expect(joined).toMatchObject({
			action: 'joined_by_invite',
			actor: { id: staff.userId, name: 'Front Desk' },
			changes: { status: { from: null, to: 'active' }, tier: { from: null, to: { id: tier.id, name: 'Full' } } },
		});
	});

	it('does not record changes that were rejected', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { golfer, membership } = await createMember(setup, tier);

		expect((await approveMembership(setup, setup.owner, membership.id, { tierId: tier.id, startsOn: LONG_AGO })).status).toBe(409);
		// Blocked inside the database write itself (the upsert's status guard), not by an earlier check.
		expect((await requestMembership(setup, golfer)).status).toBe(409);
		expect((await updateMembership(setup, setup.owner, membership.id, { endsOn: '1999-01-01' })).status).toBe(400);

		expect((await eventsFor(setup, membership.id)).map((event) => event.action)).toEqual(['approved', 'requested']);
	});

	it('does not record an update that changes nothing', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { membership } = await createMember(setup, tier);

		await updateMembership(setup, setup.owner, membership.id, { tierId: tier.id, status: 'active' });

		expect((await eventsFor(setup, membership.id)).map((event) => event.action)).toEqual(['approved', 'requested']);
	});

	it('shows a membership’s history to staff only', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const staff = await addClubStaff(setup, 'staff');
		const { golfer, membership } = await createMember(setup, tier);

		expect((await membershipEvents(setup, staff, membership.id)).status).toBe(200);
		expect((await membershipEvents(setup, golfer, membership.id)).status).toBe(403);
	});

	it('shows the club-wide log, newest first, to owners and admins but not front-desk staff', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const admin = await addClubStaff(setup, 'admin', 'Admin');
		const staff = await addClubStaff(setup, 'staff', 'Front Desk');
		const { membership: first } = await createMember(setup, tier, { name: 'First' });
		const { membership: second } = await createMember(setup, tier, { name: 'Second' });

		const feed = await data<MembershipEvent[]>(await clubMembershipEvents(setup, admin));

		expect(feed.map((event) => [event.member.name, event.action])).toEqual([
			['Second', 'approved'],
			['Second', 'requested'],
			['First', 'approved'],
			['First', 'requested'],
		]);
		expect(new Set(feed.map((event) => event.membershipId))).toEqual(new Set([first.id, second.id]));
		expect((await clubMembershipEvents(setup, staff)).status).toBe(403);
	});

	it('cannot read another club’s membership history through its own club address', async () => {
		const clubA = await setUpClub('Club A');
		const clubB = await setUpClub('Club B');
		const tierB = await createTierOrFail(clubB);
		const { membership } = await createMember(clubB, tierB);

		expect((await membershipEvents(clubA, clubA.owner, membership.id)).status).toBe(404);
		expect(await data<MembershipEvent[]>(await clubMembershipEvents(clubA, clubA.owner))).toEqual([]);
	});
});
