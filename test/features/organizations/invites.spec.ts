import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../../src/db/client';
import { staffInvites } from '../../../src/db/schema';
import {
	acceptInvite,
	addStaff,
	type ApiBody,
	BASE_URL,
	createClub,
	createTestClient,
	createVerifiedUser,
	findInviteToken,
	inviteStaff,
	type TestClient,
	type TestUser,
} from '../../helpers';

interface PendingInvite {
	id: string;
	email: string;
	role: string;
	expiresAt: string;
}

const db = createDb(env.DB);

let client: TestClient;
let owner: TestUser;
let slug: string;
let clubId: string;

beforeEach(async () => {
	client = createTestClient();
	owner = await createVerifiedUser(client, 'Owner');
	({ slug, id: clubId } = await createClub(client, owner, { name: 'Pine Valley' }));
});

async function listInvites(clubSlug: string, actor: TestUser) {
	return client.request(`/api/orgs/${clubSlug}/staff/invites`, { cookie: actor.cookie });
}

async function revokeInvite(clubSlug: string, actor: TestUser, inviteId: string) {
	return client.request(`/api/orgs/${clubSlug}/staff/invites/${inviteId}`, { method: 'DELETE', cookie: actor.cookie });
}

async function pendingInvites(clubSlug: string, actor: TestUser): Promise<PendingInvite[]> {
	const body = await (await listInvites(clubSlug, actor)).json<ApiBody<PendingInvite[]>>();
	return body.data ?? [];
}

describe('inviting staff', () => {
	it('emails an invite link and adds the person once they accept', async () => {
		const admin = await createVerifiedUser(client, 'Admin');

		const inviteResponse = await inviteStaff(client, slug, owner, admin.email, 'admin');

		expect(inviteResponse.status).toBe(202);
		const email = client.outbox.findLast((message) => message.to === admin.email);
		expect(email?.text).toContain('Pine Valley');
		expect(email?.text).toContain(`${BASE_URL}/invites/accept?token=`);

		const acceptResponse = await acceptInvite(client, admin, findInviteToken(client, admin.email));

		expect(acceptResponse.status).toBe(200);
		const accepted = await acceptResponse.json<ApiBody<{ slug: string; name: string; role: string }>>();
		expect(accepted.data).toEqual({ slug, name: 'Pine Valley', role: 'admin' });
		const staff = await client.request(`/api/orgs/${slug}/staff`, { cookie: admin.cookie });
		expect(staff.status).toBe(200);
	});

	it('responds the same way whether or not the email has an account', async () => {
		const registered = await createVerifiedUser(client, 'Registered');

		const forRegistered = await inviteStaff(client, slug, owner, registered.email, 'staff');
		const forUnregistered = await inviteStaff(client, slug, owner, 'nobody-yet@example.com', 'staff');

		expect(forRegistered.status).toBe(forUnregistered.status);
		expect(await forRegistered.json()).toEqual(await forUnregistered.json());
		expect(client.outbox.some((message) => message.to === 'nobody-yet@example.com')).toBe(true);
	});

	it('treats email addresses case-insensitively', async () => {
		const starter = await createVerifiedUser(client, 'Starter');

		await inviteStaff(client, slug, owner, starter.email.toUpperCase(), 'staff');
		const response = await acceptInvite(client, starter, findInviteToken(client, starter.email));

		expect(response.status).toBe(200);
	});

	it('lets an admin invite staff but not other admins', async () => {
		const admin = await createVerifiedUser(client, 'Admin');
		await addStaff(client, slug, owner, admin, 'admin');

		expect((await inviteStaff(client, slug, admin, 'starter@example.com', 'staff')).status).toBe(202);
		expect((await inviteStaff(client, slug, admin, 'other-admin@example.com', 'admin')).status).toBe(403);
	});

	it('does not let staff invite anyone', async () => {
		const starter = await createVerifiedUser(client, 'Starter');
		await addStaff(client, slug, owner, starter, 'staff');

		const response = await inviteStaff(client, slug, starter, 'friend@example.com', 'staff');

		expect(response.status).toBe(403);
	});

	it('rejects an unknown role or an invalid email', async () => {
		expect((await inviteStaff(client, slug, owner, 'starter@example.com', 'superuser')).status).toBe(400);
		expect((await inviteStaff(client, slug, owner, 'not-an-email', 'staff')).status).toBe(400);
	});

	it('returns 409 when the person is already on staff', async () => {
		const starter = await createVerifiedUser(client, 'Starter');
		await addStaff(client, slug, owner, starter, 'staff');

		const response = await inviteStaff(client, slug, owner, starter.email, 'admin');

		expect(response.status).toBe(409);
		expect((await response.json<ApiBody<null>>()).error?.code).toBe('ALREADY_STAFF');
	});

	it('replaces an earlier invite when the same email is invited again', async () => {
		const starter = await createVerifiedUser(client, 'Starter');
		await inviteStaff(client, slug, owner, starter.email, 'staff');
		const firstToken = findInviteToken(client, starter.email);

		await inviteStaff(client, slug, owner, starter.email, 'admin');
		const secondToken = findInviteToken(client, starter.email);

		expect((await acceptInvite(client, starter, firstToken)).status).toBe(404);
		const accepted = await acceptInvite(client, starter, secondToken);
		expect((await accepted.json<ApiBody<{ role: string }>>()).data?.role).toBe('admin');
	});
});

describe('re-inviting across roles', () => {
	it('does not let an admin overwrite a pending invite they could not revoke', async () => {
		const admin = await createVerifiedUser(client, 'Admin');
		const futureOwner = await createVerifiedUser(client, 'Future Owner');
		await addStaff(client, slug, owner, admin, 'admin');
		await inviteStaff(client, slug, owner, futureOwner.email, 'owner');
		const ownerInviteToken = findInviteToken(client, futureOwner.email);

		const response = await inviteStaff(client, slug, admin, futureOwner.email, 'staff');

		expect(response.status).toBe(403);
		const [pending] = await pendingInvites(slug, owner);
		expect(pending).toMatchObject({ email: futureOwner.email, role: 'owner' });
		const accepted = await acceptInvite(client, futureOwner, ownerInviteToken);
		expect((await accepted.json<ApiBody<{ role: string }>>()).data?.role).toBe('owner');
	});
});

describe('accepting an invite', () => {
	it('requires a signed-in user', async () => {
		await inviteStaff(client, slug, owner, 'starter@example.com', 'staff');

		const response = await client.request('/api/invites/accept', {
			method: 'POST',
			json: { token: findInviteToken(client, 'starter@example.com') },
		});

		expect(response.status).toBe(401);
	});

	it('only lets the invited email address accept', async () => {
		const invited = await createVerifiedUser(client, 'Invited');
		const someoneElse = await createVerifiedUser(client, 'Someone Else');
		await inviteStaff(client, slug, owner, invited.email, 'staff');
		const token = findInviteToken(client, invited.email);

		expect((await acceptInvite(client, someoneElse, token)).status).toBe(403);
		expect((await acceptInvite(client, invited, token)).status).toBe(200);
	});

	it('works only once', async () => {
		const starter = await createVerifiedUser(client, 'Starter');
		await inviteStaff(client, slug, owner, starter.email, 'staff');
		const token = findInviteToken(client, starter.email);
		await acceptInvite(client, starter, token);

		const response = await acceptInvite(client, starter, token);

		expect(response.status).toBe(404);
	});

	it('rejects an unknown token', async () => {
		const starter = await createVerifiedUser(client, 'Starter');

		const response = await acceptInvite(client, starter, 'not-a-real-token');

		expect(response.status).toBe(404);
	});

	it('rejects an expired invite', async () => {
		const starter = await createVerifiedUser(client, 'Starter');
		await inviteStaff(client, slug, owner, starter.email, 'staff');
		await db
			.update(staffInvites)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(staffInvites.email, starter.email));

		const response = await acceptInvite(client, starter, findInviteToken(client, starter.email));

		expect(response.status).toBe(404);
	});

	it('never stores the raw invite token', async () => {
		await inviteStaff(client, slug, owner, 'starter@example.com', 'staff');
		const token = findInviteToken(client, 'starter@example.com');

		const rows = await db
			.select()
			.from(staffInvites)
			.where(and(eq(staffInvites.orgId, clubId), eq(staffInvites.email, 'starter@example.com')));

		expect(rows).toHaveLength(1);
		expect(JSON.stringify(rows)).not.toContain(token);
	});
});

describe('managing pending invites', () => {
	it('lists pending invites to staff and hides them from everyone else', async () => {
		const starter = await createVerifiedUser(client, 'Starter');
		const outsider = await createVerifiedUser(client, 'Outsider');
		await addStaff(client, slug, owner, starter, 'staff');
		await inviteStaff(client, slug, owner, 'new-admin@example.com', 'admin');

		const invites = await pendingInvites(slug, starter);

		expect(invites).toEqual([{ id: expect.any(String), email: 'new-admin@example.com', role: 'admin', expiresAt: expect.any(String) }]);
		expect((await listInvites(slug, outsider)).status).toBe(403);
	});

	it('lets an owner revoke an invite so it can no longer be accepted', async () => {
		const starter = await createVerifiedUser(client, 'Starter');
		await inviteStaff(client, slug, owner, starter.email, 'staff');
		const [invite] = await pendingInvites(slug, owner);

		expect((await revokeInvite(slug, owner, invite.id)).status).toBe(200);
		expect(await pendingInvites(slug, owner)).toEqual([]);
		expect((await acceptInvite(client, starter, findInviteToken(client, starter.email))).status).toBe(404);
	});

	it('does not let an admin revoke an invite for an admin', async () => {
		const admin = await createVerifiedUser(client, 'Admin');
		await addStaff(client, slug, owner, admin, 'admin');
		await inviteStaff(client, slug, owner, 'second-admin@example.com', 'admin');
		const [invite] = await pendingInvites(slug, owner);

		expect((await revokeInvite(slug, admin, invite.id)).status).toBe(403);
	});

	it('cannot reach another club’s invites through its own club address', async () => {
		const ownerB = await createVerifiedUser(client, 'Owner B');
		const clubB = await createClub(client, ownerB);
		await inviteStaff(client, clubB.slug, ownerB, 'b-staff@example.com', 'staff');
		const [inviteB] = await pendingInvites(clubB.slug, ownerB);

		expect((await revokeInvite(slug, owner, inviteB.id)).status).toBe(404);
		expect((await revokeInvite(clubB.slug, owner, inviteB.id)).status).toBe(403);
		expect(await pendingInvites(clubB.slug, ownerB)).toHaveLength(1);
	});
});
