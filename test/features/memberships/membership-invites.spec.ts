import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../../src/db/client';
import { membershipInvites } from '../../../src/db/schema';
import { INVITE_RATE_LIMITS } from '../../../src/lib/invites';
import { BASE_URL, createVerifiedUser, inviteStaff, type TestUser } from '../../helpers';
import {
	addClubStaff,
	type ClubSetup,
	createMember,
	createTierOrFail,
	data,
	errorCode,
	FAR_FUTURE,
	findMembershipInviteToken,
	LONG_AGO,
	type MembershipView,
	myMembership,
	requestMembership,
	setUpClub,
} from './helpers';

const db = createDb(env.DB);

interface InviteBody {
	email: string;
	tierId: string;
	startsOn: string;
	endsOn?: string;
	memberNumber?: string;
}

async function inviteMember({ client, slug }: ClubSetup, actor: TestUser, body: InviteBody) {
	return client.request(`/api/orgs/${slug}/membership-invites`, { method: 'POST', cookie: actor.cookie, json: body });
}

async function acceptMembershipInvite({ client }: ClubSetup, golfer: TestUser, token: string) {
	return client.request('/api/membership-invites/accept', { method: 'POST', cookie: golfer.cookie, json: { token } });
}

async function pendingMembershipInvites({ client, slug }: ClubSetup, actor: TestUser) {
	return client.request(`/api/orgs/${slug}/membership-invites`, { cookie: actor.cookie });
}

describe('inviting members', () => {
	it('lets front-desk staff invite a golfer who becomes an active member on accepting', async () => {
		const setup = await setUpClub('Pine Valley');
		const staff = await addClubStaff(setup, 'staff');
		const tier = await createTierOrFail(setup, 'Full', 14);
		const golfer = await createVerifiedUser(setup.client, 'Jack');

		const invite = await inviteMember(setup, staff, {
			email: golfer.email,
			tierId: tier.id,
			startsOn: LONG_AGO,
			endsOn: FAR_FUTURE,
			memberNumber: 'M-1',
		});

		expect(invite.status).toBe(202);
		const email = setup.client.outbox.findLast((message) => message.to === golfer.email);
		expect(email?.text).toContain('Pine Valley');
		expect(email?.text).toContain(`${BASE_URL}/membership-invites/accept?token=`);

		const accepted = await acceptMembershipInvite(setup, golfer, findMembershipInviteToken(setup.client, golfer.email));

		expect(accepted.status).toBe(200);
		const body = await data<{ club: { slug: string; name: string }; membership: MembershipView }>(accepted);
		expect(body.club).toEqual({ slug: setup.slug, name: 'Pine Valley' });
		expect(body.membership).toMatchObject({
			status: 'active',
			state: 'active',
			tier: { id: tier.id },
			memberNumber: 'M-1',
			endsOn: FAR_FUTURE,
		});
		expect((await myMembership(setup, golfer)).bookingWindowDays).toBe(14);
	});

	it('responds the same way whether or not the email has an account', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const registered = await createVerifiedUser(setup.client, 'Registered');

		const forRegistered = await inviteMember(setup, setup.owner, { email: registered.email, tierId: tier.id, startsOn: LONG_AGO });
		const forUnregistered = await inviteMember(setup, setup.owner, {
			email: 'new-golfer@example.com',
			tierId: tier.id,
			startsOn: LONG_AGO,
		});

		expect(forRegistered.status).toBe(forUnregistered.status);
		expect(await forRegistered.json()).toEqual(await forUnregistered.json());
	});

	it('turns a pending request into an active membership when the golfer accepts an invite', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		const request = await data<MembershipView>(await requestMembership(setup, golfer));
		await inviteMember(setup, setup.owner, { email: golfer.email, tierId: tier.id, startsOn: LONG_AGO });

		const accepted = await acceptMembershipInvite(setup, golfer, findMembershipInviteToken(setup.client, golfer.email));

		const { membership } = await data<{ membership: MembershipView }>(accepted);
		expect(membership).toMatchObject({ id: request.id, status: 'active' });
	});

	it('returns 409 when inviting someone who is already a member', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const { golfer } = await createMember(setup, tier);

		const response = await inviteMember(setup, setup.owner, { email: golfer.email, tierId: tier.id, startsOn: LONG_AGO });

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('ALREADY_MEMBER');
	});

	it('rejects a tier from another club and an end date before the start date', async () => {
		const setup = await setUpClub();
		const otherClub = await setUpClub('Other');
		const tier = await createTierOrFail(setup);
		const otherTier = await createTierOrFail(otherClub);

		expect((await inviteMember(setup, setup.owner, { email: 'a@example.com', tierId: otherTier.id, startsOn: LONG_AGO })).status).toBe(404);
		expect(
			(await inviteMember(setup, setup.owner, { email: 'b@example.com', tierId: tier.id, startsOn: '2026-06-01', endsOn: '2026-05-01' }))
				.status,
		).toBe(400);
	});

	it('does not let golfers who are not staff invite members', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const golfer = await createVerifiedUser(setup.client, 'Jack');

		expect((await inviteMember(setup, golfer, { email: 'friend@example.com', tierId: tier.id, startsOn: LONG_AGO })).status).toBe(403);
	});
});

describe('accepting a membership invite', () => {
	it('only lets the invited email address accept, and only once', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const invited = await createVerifiedUser(setup.client, 'Invited');
		const someoneElse = await createVerifiedUser(setup.client, 'Someone Else');
		await inviteMember(setup, setup.owner, { email: invited.email, tierId: tier.id, startsOn: LONG_AGO });
		const token = findMembershipInviteToken(setup.client, invited.email);

		expect((await acceptMembershipInvite(setup, someoneElse, token)).status).toBe(403);
		expect((await acceptMembershipInvite(setup, invited, token)).status).toBe(200);
		expect((await acceptMembershipInvite(setup, invited, token)).status).toBe(404);
	});

	it('rejects an expired invite', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		await inviteMember(setup, setup.owner, { email: golfer.email, tierId: tier.id, startsOn: LONG_AGO });
		await db
			.update(membershipInvites)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(and(eq(membershipInvites.orgId, setup.clubId), eq(membershipInvites.email, golfer.email)));

		const response = await acceptMembershipInvite(setup, golfer, findMembershipInviteToken(setup.client, golfer.email));

		expect(response.status).toBe(404);
	});

	it('does not replace an existing active membership', async () => {
		const setup = await setUpClub();
		const full = await createTierOrFail(setup, 'Full');
		const weekday = await createTierOrFail(setup, 'Weekday');
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		await inviteMember(setup, setup.owner, { email: golfer.email, tierId: weekday.id, startsOn: LONG_AGO });
		const token = findMembershipInviteToken(setup.client, golfer.email);
		await createMemberFor(setup, golfer, full.id);

		const response = await acceptMembershipInvite(setup, golfer, token);

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('ALREADY_MEMBER');
		expect((await myMembership(setup, golfer)).membership?.tier?.name).toBe('Full');
		// The invite has nothing left to grant, so it is used up rather than left pending.
		expect(await data<unknown[]>(await pendingMembershipInvites(setup, setup.owner))).toEqual([]);
	});

	it('never stores the raw invite token', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		await inviteMember(setup, setup.owner, { email: 'new-golfer@example.com', tierId: tier.id, startsOn: LONG_AGO });
		const token = findMembershipInviteToken(setup.client, 'new-golfer@example.com');

		const rows = await db.select().from(membershipInvites).where(eq(membershipInvites.orgId, setup.clubId));

		expect(rows).toHaveLength(1);
		expect(JSON.stringify(rows)).not.toContain(token);
	});
});

describe('managing pending membership invites', () => {
	it('lists and revokes invites for staff only', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup, 'Full');
		const golfer = await createVerifiedUser(setup.client, 'Jack');
		await inviteMember(setup, setup.owner, { email: 'new-golfer@example.com', tierId: tier.id, startsOn: LONG_AGO });

		expect((await pendingMembershipInvites(setup, golfer)).status).toBe(403);
		const invites = await data<{ id: string; email: string; tier: { name: string } }[]>(await pendingMembershipInvites(setup, setup.owner));
		expect(invites).toMatchObject([{ email: 'new-golfer@example.com', tier: { name: 'Full' } }]);

		const revoke = await setup.client.request(`/api/orgs/${setup.slug}/membership-invites/${invites[0].id}`, {
			method: 'DELETE',
			cookie: setup.owner.cookie,
		});
		expect(revoke.status).toBe(200);
		expect(await data<unknown[]>(await pendingMembershipInvites(setup, setup.owner))).toEqual([]);
	});

	it('cannot revoke another club’s invite through its own club address', async () => {
		const clubA = await setUpClub('Club A');
		const clubB = await setUpClub('Club B');
		const tierB = await createTierOrFail(clubB);
		await inviteMember(clubB, clubB.owner, { email: 'b-golfer@example.com', tierId: tierB.id, startsOn: LONG_AGO });
		const [inviteB] = await data<{ id: string }[]>(await pendingMembershipInvites(clubB, clubB.owner));

		const response = await clubA.client.request(`/api/orgs/${clubA.slug}/membership-invites/${inviteB.id}`, {
			method: 'DELETE',
			cookie: clubA.owner.cookie,
		});

		expect(response.status).toBe(404);
	});
});

async function createMemberFor(setup: ClubSetup, golfer: TestUser, tierId: string): Promise<void> {
	const request = await data<MembershipView>(await requestMembership(setup, golfer));
	const response = await setup.client.request(`/api/orgs/${setup.slug}/memberships/${request.id}/approve`, {
		method: 'POST',
		cookie: setup.owner.cookie,
		json: { tierId, startsOn: LONG_AGO },
	});
	expect(response.status).toBe(200);
}

describe('invite email rate limits', () => {
	const SENDER_LIMIT = INVITE_RATE_LIMITS.sender.limit;
	const RECIPIENT_LIMIT = INVITE_RATE_LIMITS.recipient.limit;

	it('caps how many invite emails one person can send per hour, across staff and membership invites', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);

		for (let sent = 0; sent < SENDER_LIMIT; sent++) {
			const response = await inviteMember(setup, setup.owner, { email: `golfer-${sent}@example.com`, tierId: tier.id, startsOn: LONG_AGO });
			expect(response.status).toBe(202);
		}

		const overLimit = await inviteMember(setup, setup.owner, { email: 'one-too-many@example.com', tierId: tier.id, startsOn: LONG_AGO });
		expect(overLimit.status).toBe(429);
		expect(await errorCode(overLimit)).toBe('RATE_LIMITED');
		expect(Number(overLimit.headers.get('retry-after'))).toBeGreaterThan(0);
		expect(setup.client.outbox.some((message) => message.to === 'one-too-many@example.com')).toBe(false);

		const staffInvite = await inviteStaff(setup.client, setup.slug, setup.owner, 'new-staff@example.com', 'staff');
		expect(staffInvite.status).toBe(429);
	});

	it('tracks the sender limit separately for each person', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const staff = await addClubStaff(setup, 'staff');
		for (let sent = 0; sent < SENDER_LIMIT; sent++) {
			await inviteMember(setup, setup.owner, { email: `golfer-${sent}@example.com`, tierId: tier.id, startsOn: LONG_AGO });
		}

		const response = await inviteMember(setup, staff, { email: 'from-staff@example.com', tierId: tier.id, startsOn: LONG_AGO });

		expect(response.status).toBe(202);
	});

	it('stops repeated invite emails to the same inbox, even from different staff', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const staff = await addClubStaff(setup, 'staff');
		const target = 'popular-golfer@example.com';

		for (let sent = 0; sent < RECIPIENT_LIMIT; sent++) {
			const sender = sent % 2 === 0 ? setup.owner : staff;
			expect((await inviteMember(setup, sender, { email: target, tierId: tier.id, startsOn: LONG_AGO })).status).toBe(202);
		}

		const overLimit = await inviteMember(setup, staff, { email: target.toUpperCase(), tierId: tier.id, startsOn: LONG_AGO });
		expect(overLimit.status).toBe(429);
		expect(setup.client.outbox.filter((message) => message.to === target)).toHaveLength(RECIPIENT_LIMIT);
	});

	it('does not let people who are not staff use up a club’s invite allowance', async () => {
		const setup = await setUpClub();
		const tier = await createTierOrFail(setup);
		const outsider = await createVerifiedUser(setup.client, 'Outsider');
		const target = 'protected-golfer@example.com';

		for (let attempt = 0; attempt <= RECIPIENT_LIMIT; attempt++) {
			expect((await inviteMember(setup, outsider, { email: target, tierId: tier.id, startsOn: LONG_AGO })).status).toBe(403);
		}

		expect((await inviteMember(setup, setup.owner, { email: target, tierId: tier.id, startsOn: LONG_AGO })).status).toBe(202);
	});
});
