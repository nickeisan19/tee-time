import { beforeEach, describe, expect, it } from 'vitest';
import {
	addStaff,
	type ApiBody,
	createClub,
	createTestClient,
	createVerifiedUser,
	inviteStaff,
	type TestClient,
	type TestUser,
	uniqueSlug,
} from '../../helpers';

interface StaffMember {
	userId: string;
	name: string;
	email: string;
	role: string;
}

let client: TestClient;
let owner: TestUser;

beforeEach(async () => {
	client = createTestClient();
	owner = await createVerifiedUser(client, 'Owner');
});

async function listStaff(slug: string, actor: TestUser) {
	return client.request(`/api/orgs/${slug}/staff`, { cookie: actor.cookie });
}

async function removeStaff(slug: string, actor: TestUser, userId: string) {
	return client.request(`/api/orgs/${slug}/staff/${userId}`, { method: 'DELETE', cookie: actor.cookie });
}

describe('POST /api/orgs', () => {
	it('requires a signed-in user', async () => {
		const response = await client.request('/api/orgs', {
			method: 'POST',
			json: { name: 'Pine Valley', slug: uniqueSlug(), timezone: 'America/Chicago' },
		});

		expect(response.status).toBe(401);
		const body = await response.json<ApiBody<null>>();
		expect(body).toEqual({ success: false, data: null, error: { code: 'UNAUTHENTICATED', message: expect.any(String) } });
	});

	it('creates a club and makes the creator its owner', async () => {
		const slug = uniqueSlug();

		const club = await createClub(client, owner, { name: 'Augusta Pines', slug });

		expect(club).toMatchObject({ slug, name: 'Augusta Pines', timezone: 'America/Chicago' });
		const staff = await (await listStaff(slug, owner)).json<ApiBody<StaffMember[]>>();
		expect(staff.data).toEqual([{ userId: owner.userId, name: 'Owner', email: owner.email, role: 'owner' }]);
	});

	it.each([
		['an uppercase slug', { slug: 'Pine-Valley' }],
		['a slug with spaces', { slug: 'pine valley' }],
		['a one-character slug', { slug: 'p' }],
		['an unknown timezone', { timezone: 'Mars/Olympus_Mons' }],
		['an empty name', { name: '' }],
	])('rejects %s', async (_label, overrides) => {
		const response = await client.request('/api/orgs', {
			method: 'POST',
			cookie: owner.cookie,
			json: { name: 'Pine Valley', slug: uniqueSlug(), timezone: 'America/Chicago', ...overrides },
		});

		expect(response.status).toBe(400);
		const body = await response.json<ApiBody<null>>();
		expect(body.error?.code).toBe('VALIDATION_ERROR');
	});

	it('rejects a malformed JSON body', async () => {
		const response = await client.request('/api/orgs', { method: 'POST', cookie: owner.cookie, body: '{not json' });

		expect(response.status).toBe(400);
	});

	it('rejects a slug that is already taken', async () => {
		const { slug } = await createClub(client, owner);

		const response = await client.request('/api/orgs', {
			method: 'POST',
			cookie: owner.cookie,
			json: { name: 'Copycat', slug, timezone: 'America/Chicago' },
		});

		expect(response.status).toBe(409);
		expect((await response.json<ApiBody<null>>()).error?.code).toBe('SLUG_TAKEN');
	});
});

describe('GET /api/orgs/:slug', () => {
	it('returns public club details without signing in', async () => {
		const { slug } = await createClub(client, owner, { name: 'Pebble Creek', timezone: 'America/Los_Angeles' });

		const response = await client.request(`/api/orgs/${slug}`);

		expect(response.status).toBe(200);
		const body = await response.json<ApiBody<Record<string, unknown>>>();
		expect(body.data).toEqual({ id: expect.any(String), name: 'Pebble Creek', slug, timezone: 'America/Los_Angeles' });
	});

	it('returns 404 for an unknown club', async () => {
		const response = await client.request(`/api/orgs/${uniqueSlug('missing')}`);

		expect(response.status).toBe(404);
		expect((await response.json<ApiBody<null>>()).error?.code).toBe('NOT_FOUND');
	});
});

describe('club staff list and removal', () => {
	it('lists staff in the order they joined', async () => {
		const { slug } = await createClub(client, owner);
		const admin = await createVerifiedUser(client, 'Admin');
		const starter = await createVerifiedUser(client, 'Starter');
		await addStaff(client, slug, owner, admin, 'admin');
		await addStaff(client, slug, admin, starter, 'staff');

		const staff = await (await listStaff(slug, starter)).json<ApiBody<StaffMember[]>>();

		expect(staff.data?.map((member) => [member.name, member.role])).toEqual([
			['Owner', 'owner'],
			['Admin', 'admin'],
			['Starter', 'staff'],
		]);
	});

	it('lets an owner remove a staff member', async () => {
		const { slug } = await createClub(client, owner);
		const starter = await createVerifiedUser(client, 'Starter');
		await addStaff(client, slug, owner, starter, 'staff');

		const response = await removeStaff(slug, owner, starter.userId);

		expect(response.status).toBe(200);
		expect((await listStaff(slug, starter)).status).toBe(403);
	});

	it('does not let an admin remove an owner', async () => {
		const { slug } = await createClub(client, owner);
		const admin = await createVerifiedUser(client, 'Admin');
		await addStaff(client, slug, owner, admin, 'admin');

		const response = await removeStaff(slug, admin, owner.userId);

		expect(response.status).toBe(403);
	});

	it('never removes the last owner', async () => {
		const { slug } = await createClub(client, owner);

		const response = await removeStaff(slug, owner, owner.userId);

		expect(response.status).toBe(409);
		expect((await response.json<ApiBody<null>>()).error?.code).toBe('LAST_OWNER');
	});

	it('allows removing an owner when another owner remains', async () => {
		const { slug } = await createClub(client, owner);
		const coOwner = await createVerifiedUser(client, 'Co-owner');
		await addStaff(client, slug, owner, coOwner, 'owner');

		const response = await removeStaff(slug, coOwner, owner.userId);

		expect(response.status).toBe(200);
	});

	it('returns 404 when removing someone who is not on staff', async () => {
		const { slug } = await createClub(client, owner);
		const stranger = await createVerifiedUser(client, 'Stranger');

		const response = await removeStaff(slug, owner, stranger.userId);

		expect(response.status).toBe(404);
	});
});

describe('tenant isolation', () => {
	it('does not let the owner of one club see or change another club’s staff', async () => {
		const clubA = await createClub(client, owner);
		const ownerB = await createVerifiedUser(client, 'Owner B');
		const clubB = await createClub(client, ownerB);
		const recruit = await createVerifiedUser(client, 'Recruit');

		expect((await listStaff(clubB.slug, owner)).status).toBe(403);
		expect((await inviteStaff(client, clubB.slug, owner, recruit.email, 'staff')).status).toBe(403);
		expect((await removeStaff(clubB.slug, owner, ownerB.userId)).status).toBe(403);

		const staffB = await (await listStaff(clubB.slug, ownerB)).json<ApiBody<StaffMember[]>>();
		expect(staffB.data?.map((member) => member.userId)).toEqual([ownerB.userId]);
		const staffA = await (await listStaff(clubA.slug, owner)).json<ApiBody<StaffMember[]>>();
		expect(staffA.data?.map((member) => member.userId)).toEqual([owner.userId]);
	});

	it('does not let a signed-out visitor list staff', async () => {
		const { slug } = await createClub(client, owner);

		const response = await client.request(`/api/orgs/${slug}/staff`);

		expect(response.status).toBe(401);
	});
});
