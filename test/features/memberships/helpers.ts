import { expect } from 'vitest';
import {
	addStaff,
	type ApiBody,
	createClub,
	createTestClient,
	createVerifiedUser,
	findLinkToken,
	type TestClient,
	type TestUser,
} from '../../helpers';

export const LONG_AGO = '2000-01-01';
export const FAR_FUTURE = '2999-01-01';

export interface Tier {
	id: string;
	name: string;
	bookingWindowDays: number;
}

export interface MembershipView {
	id: string;
	user: { id: string; name: string; email: string };
	status: string;
	state: string;
	tier: Tier | null;
	requestedTier: { id: string; name: string } | null;
	memberNumber: string | null;
	startsOn: string | null;
	endsOn: string | null;
	requestNote: string | null;
	decidedAt: string | null;
}

export interface MyMembership {
	membership: MembershipView | null;
	state: string;
	bookingWindowDays: number;
}

export interface ClubSetup {
	client: TestClient;
	owner: TestUser;
	slug: string;
	clubId: string;
}

export async function setUpClub(name = 'Pine Valley'): Promise<ClubSetup> {
	const client = createTestClient();
	const owner = await createVerifiedUser(client, 'Owner');
	const { slug, id: clubId } = await createClub(client, owner, { name });
	return { client, owner, slug, clubId };
}

export async function addClubStaff(setup: ClubSetup, role: 'admin' | 'staff', name = 'Pro Shop'): Promise<TestUser> {
	const user = await createVerifiedUser(setup.client, name);
	await addStaff(setup.client, setup.slug, setup.owner, user, role);
	return user;
}

export async function data<T>(response: Response): Promise<T> {
	const body = await response.json<ApiBody<T>>();
	if (body.data === null) throw new Error(`Expected data, got error ${JSON.stringify(body.error)}`);
	return body.data;
}

export async function errorCode(response: Response): Promise<string | undefined> {
	return (await response.json<ApiBody<null>>()).error?.code;
}

export async function createTier(
	{ client, slug }: ClubSetup,
	actor: TestUser,
	body: { name: string; bookingWindowDays: number },
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/membership-tiers`, { method: 'POST', cookie: actor.cookie, json: body });
}

export async function createTierOrFail(setup: ClubSetup, name = 'Full', bookingWindowDays = 14): Promise<Tier> {
	const response = await createTier(setup, setup.owner, { name, bookingWindowDays });
	expect(response.status).toBe(201);
	return data<Tier>(response);
}

export async function requestMembership(
	{ client, slug }: ClubSetup,
	golfer: TestUser,
	body: { requestedTierId?: string; note?: string } = {},
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/membership-requests`, { method: 'POST', cookie: golfer.cookie, json: body });
}

export async function listMemberships({ client, slug }: ClubSetup, actor: TestUser, status?: string, search?: string): Promise<Response> {
	const params = new URLSearchParams();
	if (status) params.set('status', status);
	if (search !== undefined) params.set('q', search);
	const query = params.size > 0 ? `?${params}` : '';
	return client.request(`/api/orgs/${slug}/memberships${query}`, { cookie: actor.cookie });
}

export interface StaffMembershipView extends MembershipView {
	possibleDuplicates: number;
}

export interface MembershipEvent {
	id: string;
	membershipId: string;
	member: { id: string; name: string; email: string };
	action: string;
	actor: { id: string | null; name: string | null; email: string | null } | null;
	changes: Record<string, { from: unknown; to: unknown }>;
	note: string | null;
	createdAt: string;
}

export async function membershipEvents({ client, slug }: ClubSetup, actor: TestUser, membershipId: string): Promise<Response> {
	return client.request(`/api/orgs/${slug}/memberships/${membershipId}/events`, { cookie: actor.cookie });
}

export async function clubMembershipEvents({ client, slug }: ClubSetup, actor: TestUser): Promise<Response> {
	return client.request(`/api/orgs/${slug}/membership-events`, { cookie: actor.cookie });
}

export async function approveMembership(
	{ client, slug }: ClubSetup,
	actor: TestUser,
	membershipId: string,
	body: { tierId: string; startsOn: string; endsOn?: string; memberNumber?: string },
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/memberships/${membershipId}/approve`, {
		method: 'POST',
		cookie: actor.cookie,
		json: body,
	});
}

export async function denyMembership(
	{ client, slug }: ClubSetup,
	actor: TestUser,
	membershipId: string,
	body: { reason?: string } = {},
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/memberships/${membershipId}/deny`, { method: 'POST', cookie: actor.cookie, json: body });
}

export async function updateMembership(
	{ client, slug }: ClubSetup,
	actor: TestUser,
	membershipId: string,
	body: Record<string, unknown>,
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/memberships/${membershipId}`, { method: 'PATCH', cookie: actor.cookie, json: body });
}

export async function myMembership({ client, slug }: ClubSetup, golfer: TestUser): Promise<MyMembership> {
	const response = await client.request(`/api/orgs/${slug}/memberships/me`, { cookie: golfer.cookie });
	expect(response.status).toBe(200);
	return data<MyMembership>(response);
}

/** Creates a golfer with an approved membership on the given tier. */
export async function createMember(
	setup: ClubSetup,
	tier: Tier,
	options: { name?: string; startsOn?: string; endsOn?: string; memberNumber?: string } = {},
): Promise<{ golfer: TestUser; membership: MembershipView }> {
	const golfer = await createVerifiedUser(setup.client, options.name ?? 'Member');
	const request = await data<MembershipView>(await requestMembership(setup, golfer));
	const approved = await approveMembership(setup, setup.owner, request.id, {
		tierId: tier.id,
		startsOn: options.startsOn ?? LONG_AGO,
		endsOn: options.endsOn,
		memberNumber: options.memberNumber,
	});
	expect(approved.status).toBe(200);
	return { golfer, membership: await data<MembershipView>(approved) };
}

export function findMembershipInviteToken(client: TestClient, email: string): string {
	return findLinkToken(client.outbox, email, '/membership-invites/accept');
}
