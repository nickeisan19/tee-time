import { describe, expect, it } from 'vitest';
import { type ApiBody, createTestClient } from './helpers';

describe('app', () => {
	it('returns a JSON 404 envelope for unknown routes', async () => {
		const response = await createTestClient().request('/api/does-not-exist');

		expect(response.status).toBe(404);
		expect(await response.json<ApiBody<null>>()).toEqual({
			success: false,
			data: null,
			error: { code: 'NOT_FOUND', message: expect.any(String) },
		});
	});

	it('returns a generic 500 envelope without leaking configuration errors', async () => {
		const client = createTestClient({ BETTER_AUTH_SECRET: 'too-short' });

		const response = await client.request('/api/orgs/any-club');

		expect(response.status).toBe(500);
		const body = await response.json<ApiBody<null>>();
		expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
	});
});
