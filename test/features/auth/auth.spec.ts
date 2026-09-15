import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../../src/db/client';
import { accounts, sessions, users } from '../../../src/db/schema';
import {
	BASE_URL,
	cookieHeader,
	createTestClient,
	createVerifiedUser,
	findLinkToken,
	signIn,
	signUp,
	submitEmailVerification,
	TEST_PASSWORD,
	uniqueEmail,
	verifyEmail,
} from '../../helpers';

const db = createDb(env.DB);

async function findUserByEmail(email: string) {
	return db.query.users.findFirst({ where: eq(users.email, email) });
}

describe('email + password sign-up', () => {
	it('sends a verification email and does not start a session', async () => {
		const client = createTestClient();
		const email = uniqueEmail();

		const response = await signUp(client, email);

		expect(response.ok).toBe(true);
		expect(client.outbox).toHaveLength(1);
		expect(client.outbox[0].to).toBe(email);
		expect(client.outbox[0].text).toContain(`${BASE_URL}/verify-email?token=`);
		expect(client.outbox[0].text).toMatch(/didn.t create this account/i);

		const user = await findUserByEmail(email);
		expect(user?.emailVerified).toBe(false);
		const userSessions = await db.select().from(sessions).where(eq(sessions.userId, user!.id));
		expect(userSessions).toHaveLength(0);
	});

	it('stores a password hash, never the plaintext password', async () => {
		const client = createTestClient();
		const email = uniqueEmail();
		await signUp(client, email);

		const user = await findUserByEmail(email);
		const [credential] = await db.select().from(accounts).where(eq(accounts.userId, user!.id));

		expect(credential.providerId).toBe('credential');
		expect(credential.password).toBeTruthy();
		expect(credential.password).not.toContain(TEST_PASSWORD);
	});

	it('rejects sign-in until the email address is verified', async () => {
		const client = createTestClient();
		const email = uniqueEmail();
		await signUp(client, email);

		const response = await signIn(client, email);

		expect(response.status).toBe(403);
	});

	it('signs in after verification and returns the session user', async () => {
		const client = createTestClient();
		const email = uniqueEmail();
		await signUp(client, email, 'Arnold');
		await verifyEmail(client, email);

		const signInResponse = await signIn(client, email);
		expect(signInResponse.ok).toBe(true);

		const sessionResponse = await client.request('/api/auth/get-session', { cookie: cookieHeader(signInResponse) });
		const session = await sessionResponse.json<{ user: { email: string; name: string; emailVerified: boolean } }>();
		expect(session.user).toMatchObject({ email, name: 'Arnold', emailVerified: true });
	});

	it('rejects a wrong password', async () => {
		const client = createTestClient();
		const { email } = await createVerifiedUser(client);

		const response = await client.request('/api/auth/sign-in/email', {
			method: 'POST',
			json: { email, password: 'not-the-right-password' },
		});

		expect(response.status).toBe(401);
	});

	it('does not create a second user for an email that is already registered', async () => {
		const client = createTestClient();
		const email = uniqueEmail();
		await signUp(client, email);

		await signUp(client, email, 'Impostor');

		const matching = await db.select().from(users).where(eq(users.email, email));
		expect(matching).toHaveLength(1);
		expect(matching[0].name).toBe('Test Golfer');
	});

	it('rejects passwords shorter than the minimum length', async () => {
		const client = createTestClient();

		const response = await client.request('/api/auth/sign-up/email', {
			method: 'POST',
			json: { name: 'Short', email: uniqueEmail(), password: 'short' },
		});

		expect(response.ok).toBe(false);
	});
});

describe('email verification', () => {
	async function signUpAndGetToken(client: ReturnType<typeof createTestClient>) {
		const email = uniqueEmail();
		await signUp(client, email);
		return { email, token: findLinkToken(client.outbox, email, '/verify-email') };
	}

	it('verifies the email when the account password is confirmed', async () => {
		const client = createTestClient();
		const { email, token } = await signUpAndGetToken(client);

		const response = await submitEmailVerification(client, token, TEST_PASSWORD);

		expect(response.status).toBe(200);
		expect((await findUserByEmail(email))?.emailVerified).toBe(true);
	});

	it('stops someone who does not know the password from verifying the account', async () => {
		// An attacker signs up with a victim's email; the victim receives the link but not the attacker's password.
		const client = createTestClient();
		const { email, token } = await signUpAndGetToken(client);

		const response = await submitEmailVerification(client, token, 'victim-does-not-know-this');

		expect(response.status).toBe(401);
		expect((await findUserByEmail(email))?.emailVerified).toBe(false);
	});

	it('rejects a tampered token', async () => {
		const client = createTestClient();
		const { email, token } = await signUpAndGetToken(client);

		const response = await submitEmailVerification(client, `${token}tampered`, TEST_PASSWORD);

		expect(response.status).toBe(400);
		expect((await findUserByEmail(email))?.emailVerified).toBe(false);
	});

	it('disables the one-click verification link', async () => {
		const client = createTestClient();
		const { email, token } = await signUpAndGetToken(client);

		const response = await client.request(`/api/auth/verify-email?token=${token}`);

		expect(response.status).toBe(404);
		expect((await findUserByEmail(email))?.emailVerified).toBe(false);
	});

	it('limits password guesses on the verification endpoint', async () => {
		const client = createTestClient();
		const { email, token } = await signUpAndGetToken(client);
		const ip = '203.0.113.20';
		const VERIFICATION_ATTEMPTS_ALLOWED = 5;

		const statuses: number[] = [];
		for (let attempt = 0; attempt <= VERIFICATION_ATTEMPTS_ALLOWED; attempt++) {
			statuses.push((await submitEmailVerification(client, token, `guess-${attempt}`, ip)).status);
		}

		expect(statuses.slice(0, VERIFICATION_ATTEMPTS_ALLOWED)).not.toContain(429);
		expect(statuses[VERIFICATION_ATTEMPTS_ALLOWED]).toBe(429);
		expect((await submitEmailVerification(client, token, TEST_PASSWORD, ip)).status).toBe(429);
		expect((await findUserByEmail(email))?.emailVerified).toBe(false);
	});
});

describe('rate limiting', () => {
	const SIGN_IN_ATTEMPTS_ALLOWED = 3;

	it('blocks repeated sign-in attempts from the same IP address', async () => {
		const client = createTestClient();
		const email = uniqueEmail();
		const ip = '203.0.113.7';

		const statuses: number[] = [];
		for (let attempt = 0; attempt <= SIGN_IN_ATTEMPTS_ALLOWED; attempt++) {
			statuses.push((await signIn(client, email, ip)).status);
		}

		expect(statuses.slice(0, SIGN_IN_ATTEMPTS_ALLOWED)).not.toContain(429);
		expect(statuses[SIGN_IN_ATTEMPTS_ALLOWED]).toBe(429);
	});

	it('tracks limits separately for each IP address', async () => {
		const client = createTestClient();
		const email = uniqueEmail();
		for (let attempt = 0; attempt <= SIGN_IN_ATTEMPTS_ALLOWED; attempt++) {
			await signIn(client, email, '203.0.113.8');
		}

		const response = await signIn(client, email, '203.0.113.9');

		expect(response.status).not.toBe(429);
	});
});

describe('Google sign-in', () => {
	const startGoogleSignIn = (client: ReturnType<typeof createTestClient>) =>
		client.request('/api/auth/sign-in/social', {
			method: 'POST',
			json: { provider: 'google', callbackURL: '/' },
		});

	it('is unavailable when Google credentials are not configured', async () => {
		const response = await startGoogleSignIn(createTestClient());

		expect(response.ok).toBe(false);
	});

	it('redirects to Google when credentials are configured', async () => {
		const client = createTestClient({ GOOGLE_CLIENT_ID: 'test-client-id', GOOGLE_CLIENT_SECRET: 'test-client-secret' });

		const response = await startGoogleSignIn(client);

		expect(response.ok).toBe(true);
		const body = await response.json<{ url: string }>();
		const googleUrl = new URL(body.url);
		expect(googleUrl.hostname).toBe('accounts.google.com');
		expect(googleUrl.searchParams.get('client_id')).toBe('test-client-id');
	});
});
