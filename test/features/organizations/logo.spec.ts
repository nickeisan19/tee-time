import { describe, expect, it } from 'vitest';
import { createVerifiedUser } from '../../helpers';
import { addClubStaff, type ClubSetup, data, errorCode, setUpClub } from '../memberships/helpers';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const MAX_LOGO_BYTES = 512 * 1024;

async function uploadLogo({ client, slug }: ClubSetup, cookie: string, bytes: Uint8Array, contentType: string) {
	return client.request(`/api/orgs/${slug}/logo`, { method: 'PUT', cookie, body: bytes, contentType });
}

describe('club logos', () => {
	it('lets an owner upload a logo that anyone can load from the club’s logo URL', async () => {
		const setup = await setUpClub();

		const response = await uploadLogo(setup, setup.owner.cookie, PNG_BYTES, 'image/png');

		expect(response.status).toBe(200);
		const club = await data<{ logoUrl: string | null }>(response);
		expect(club.logoUrl).toMatch(new RegExp(`^/api/orgs/${setup.slug}/logo\\?v=\\d+$`));
		const details = await data<{ logoUrl: string | null }>(await setup.client.request(`/api/orgs/${setup.slug}`));
		expect(details.logoUrl).toBe(club.logoUrl);

		const logo = await setup.client.request(club.logoUrl!);
		expect(logo.status).toBe(200);
		expect(logo.headers.get('content-type')).toBe('image/png');
		expect(logo.headers.get('cache-control')).toContain('immutable');
		expect(logo.headers.get('x-content-type-options')).toBe('nosniff');
		expect(new Uint8Array(await logo.arrayBuffer())).toEqual(PNG_BYTES);
	});

	it('replaces the logo and changes its URL so browsers fetch the new one', async () => {
		const setup = await setUpClub();
		const first = await data<{ logoUrl: string }>(await uploadLogo(setup, setup.owner.cookie, PNG_BYTES, 'image/png'));
		await new Promise((resolve) => setTimeout(resolve, 5));

		const second = await data<{ logoUrl: string }>(await uploadLogo(setup, setup.owner.cookie, JPEG_BYTES, 'image/jpeg'));

		expect(second.logoUrl).not.toBe(first.logoUrl);
		expect((await setup.client.request(second.logoUrl)).headers.get('content-type')).toBe('image/jpeg');
	});

	it.each([
		['an SVG, which can carry scripts', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml'],
		['bytes that are not really a PNG', new TextEncoder().encode('<html>not an image</html>'), 'image/png'],
		['a file over 512 KB', new Uint8Array(MAX_LOGO_BYTES + 1).fill(0).map((value, index) => (index < PNG_BYTES.length ? PNG_BYTES[index] : value)), 'image/png'],
	])('rejects %s', async (_label, bytes, contentType) => {
		const setup = await setUpClub();

		const response = await uploadLogo(setup, setup.owner.cookie, bytes, contentType);

		expect(response.status).toBe(400);
		expect(await errorCode(response)).toBe('VALIDATION_ERROR');
	});

	it('only lets owners and admins change the logo', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const outsider = await createVerifiedUser(setup.client, 'Outsider');

		expect((await uploadLogo(setup, staff.cookie, PNG_BYTES, 'image/png')).status).toBe(403);
		expect((await uploadLogo(setup, outsider.cookie, PNG_BYTES, 'image/png')).status).toBe(403);
	});

	it('removes a logo', async () => {
		const setup = await setUpClub();
		const { logoUrl } = await data<{ logoUrl: string }>(await uploadLogo(setup, setup.owner.cookie, PNG_BYTES, 'image/png'));

		const response = await setup.client.request(`/api/orgs/${setup.slug}/logo`, { method: 'DELETE', cookie: setup.owner.cookie });

		expect((await data<{ logoUrl: string | null }>(response)).logoUrl).toBeNull();
		expect((await setup.client.request(logoUrl)).status).toBe(404);
	});

	it('rejects an oversized upload that does not declare its length', async () => {
		const setup = await setUpClub();
		const oversized = new Uint8Array(MAX_LOGO_BYTES + 1);
		oversized.set(PNG_BYTES);
		// A stream body is sent without Content-Length, so only the capped read can catch it.
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(oversized);
				controller.close();
			},
		});

		const response = await setup.client.request(`/api/orgs/${setup.slug}/logo`, { method: 'PUT', cookie: setup.owner.cookie, body, contentType: 'image/png' });

		expect(response.status).toBe(400);
		expect(await errorCode(response)).toBe('VALIDATION_ERROR');
	});

	it('limits how often a club can change its logo', async () => {
		const setup = await setUpClub();
		const LOGO_CHANGES_ALLOWED = 20;

		const statuses: number[] = [];
		for (let attempt = 0; attempt <= LOGO_CHANGES_ALLOWED; attempt++) {
			statuses.push((await uploadLogo(setup, setup.owner.cookie, PNG_BYTES, 'image/png')).status);
		}

		expect(statuses.slice(0, LOGO_CHANGES_ALLOWED)).not.toContain(429);
		expect(statuses[LOGO_CHANGES_ALLOWED]).toBe(429);
		expect((await setup.client.request(`/api/orgs/${setup.slug}/logo`, { method: 'DELETE', cookie: setup.owner.cookie })).status).toBe(429);
	});

	it('returns 404 for a club without a logo', async () => {
		const setup = await setUpClub();

		expect((await setup.client.request(`/api/orgs/${setup.slug}/logo`)).status).toBe(404);
	});
});
