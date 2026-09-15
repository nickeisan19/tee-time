import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { ApiError, apiRequest, authRequest, errorMessage } from './api';

describe('apiRequest', () => {
	it('unwraps successful responses', async () => {
		server.use(http.get('/api/orgs/pine', () => HttpResponse.json({ success: true, data: { name: 'Pine' }, error: null })));

		await expect(apiRequest('/orgs/pine')).resolves.toEqual({ name: 'Pine' });
	});

	it('sends JSON bodies and throws ApiError with the server’s code and message', async () => {
		server.use(
			http.post('/api/orgs/pine/bookings', async ({ request }) => {
				expect(await request.json()).toEqual({ holes: 9 });
				return HttpResponse.json({ success: false, data: null, error: { code: 'TEE_TIME_UNAVAILABLE', message: 'Full' } }, { status: 409 });
			}),
		);

		const attempt = apiRequest('/orgs/pine/bookings', { method: 'POST', body: { holes: 9 } });

		await expect(attempt).rejects.toEqual(new ApiError(409, 'TEE_TIME_UNAVAILABLE', 'Full'));
	});

	it('uses a friendly message when the response is not JSON', async () => {
		server.use(http.get('/api/broken', () => new HttpResponse('oops', { status: 502 })));

		await expect(apiRequest('/broken')).rejects.toMatchObject({ status: 502, message: 'Something went wrong. Please try again.' });
	});
});

describe('authRequest', () => {
	it('returns Better Auth JSON and maps its errors', async () => {
		server.use(
			http.post('/api/auth/sign-in/email', () => HttpResponse.json({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }, { status: 403 })),
			http.get('/api/auth/get-session', () => HttpResponse.json(null)),
		);

		await expect(authRequest('/sign-in/email', { body: {} })).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
		await expect(authRequest('/get-session', { method: 'GET' })).resolves.toBeNull();
	});
});

describe('errorMessage', () => {
	it('falls back for unknown errors', () => {
		expect(errorMessage(new Error('Nope'))).toBe('Nope');
		expect(errorMessage('weird')).toBe('Something went wrong. Please try again.');
	});
});
