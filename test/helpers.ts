import { env } from 'cloudflare:workers';
import { expect } from 'vitest';
import { createApp } from '../src/app';
import type { EmailMessage } from '../src/lib/email';

export const BASE_URL = 'http://localhost:8787';
export const TEST_PASSWORD = 'correct-horse-battery-staple';

export interface ApiBody<T> {
	success: boolean;
	data: T | null;
	error: { code: string; message: string } | null;
}

interface RequestOptions {
	method?: string;
	json?: unknown;
	body?: string | Uint8Array | ReadableStream<Uint8Array>;
	/** Content type for a raw `body`; defaults to JSON. */
	contentType?: string;
	cookie?: string;
	/** Client IP as Cloudflare reports it. Defaults to a random address so rate limits don't bleed between requests. */
	ip?: string;
}

export interface TestClient {
	outbox: EmailMessage[];
	request(path: string, options?: RequestOptions): Promise<Response>;
}

export interface TestUser {
	userId: string;
	email: string;
	cookie: string;
}

export function createTestClient(envOverrides: Record<string, string> = {}): TestClient {
	const outbox: EmailMessage[] = [];
	const app = createApp({
		emailSender: {
			send: async (message) => {
				outbox.push(message);
			},
		},
	});
	const testEnv = { ...env, ...envOverrides };

	return {
		outbox,
		request: async (path, { method = 'GET', json, body, contentType, cookie, ip = randomIp() } = {}) => {
			const headers = new Headers({ origin: BASE_URL, 'cf-connecting-ip': ip });
			if (json !== undefined || body !== undefined) headers.set('content-type', contentType ?? 'application/json');
			if (cookie) headers.set('cookie', cookie);
			const requestBody = json === undefined ? body : JSON.stringify(json);
			return app.request(`${BASE_URL}${path}`, { method, headers, body: requestBody }, testEnv);
		},
	};
}

function randomIp(): string {
	const [a, b, c] = crypto.getRandomValues(new Uint8Array(3));
	return `10.${a}.${b}.${c}`;
}

export function uniqueEmail(label = 'golfer'): string {
	return `${label}-${crypto.randomUUID()}@example.com`;
}

export function uniqueSlug(label = 'club'): string {
	return `${label}-${crypto.randomUUID().slice(0, 8)}`;
}

export function cookieHeader(response: Response): string {
	return response.headers
		.getSetCookie()
		.map((cookie) => cookie.split(';')[0])
		.join('; ');
}

export function findEmailLink(outbox: EmailMessage[], to: string): string {
	const message = outbox.findLast((candidate) => candidate.to === to);
	const link = message?.text.match(/https?:\/\/\S+/)?.[0];
	if (!link) throw new Error(`No email with a link was sent to ${to}`);
	return link;
}

export async function signUp(client: TestClient, email: string, name = 'Test Golfer'): Promise<Response> {
	return client.request('/api/auth/sign-up/email', {
		method: 'POST',
		json: { name, email, password: TEST_PASSWORD },
	});
}

export async function signIn(client: TestClient, email: string, ip?: string): Promise<Response> {
	return client.request('/api/auth/sign-in/email', {
		method: 'POST',
		json: { email, password: TEST_PASSWORD },
		ip,
	});
}

export function findLinkToken(outbox: EmailMessage[], to: string, pathname: string): string {
	const link = new URL(findEmailLink(outbox, to));
	const token = link.searchParams.get('token');
	if (link.pathname !== pathname || !token) throw new Error(`Latest email to ${to} has no ${pathname} link`);
	return token;
}

export async function submitEmailVerification(client: TestClient, token: string, password: string, ip?: string): Promise<Response> {
	return client.request('/api/auth/verify-email-with-password', { method: 'POST', json: { token, password }, ip });
}

export async function verifyEmail(client: TestClient, email: string): Promise<void> {
	const token = findLinkToken(client.outbox, email, '/verify-email');
	const response = await submitEmailVerification(client, token, TEST_PASSWORD);
	expect(response.status).toBe(200);
}

export async function createVerifiedUser(client: TestClient, name = 'Test Golfer'): Promise<TestUser> {
	const email = uniqueEmail();
	expect((await signUp(client, email, name)).ok).toBe(true);
	await verifyEmail(client, email);

	const response = await signIn(client, email);
	expect(response.ok).toBe(true);
	const body = await response.json<{ user: { id: string } }>();
	return { userId: body.user.id, email, cookie: cookieHeader(response) };
}

export async function createClub(
	client: TestClient,
	owner: TestUser,
	overrides: Partial<{ name: string; slug: string; timezone: string }> = {},
): Promise<{ id: string; slug: string }> {
	const response = await client.request('/api/orgs', {
		method: 'POST',
		cookie: owner.cookie,
		json: { name: 'Pine Valley', slug: uniqueSlug(), timezone: 'America/Chicago', ...overrides },
	});
	expect(response.status).toBe(201);
	const body = await response.json<ApiBody<{ id: string; slug: string }>>();
	if (!body.data) throw new Error('Club creation returned no data');
	return body.data;
}

export async function inviteStaff(client: TestClient, slug: string, actor: TestUser, email: string, role: string): Promise<Response> {
	return client.request(`/api/orgs/${slug}/staff/invites`, { method: 'POST', cookie: actor.cookie, json: { email, role } });
}

export function findInviteToken(client: TestClient, email: string): string {
	return findLinkToken(client.outbox, email, '/invites/accept');
}

export async function acceptInvite(client: TestClient, user: TestUser, token: string): Promise<Response> {
	return client.request('/api/invites/accept', { method: 'POST', cookie: user.cookie, json: { token } });
}

/** Invites `user` to the club and accepts on their behalf. */
export async function addStaff(client: TestClient, slug: string, actor: TestUser, user: TestUser, role: string): Promise<void> {
	expect((await inviteStaff(client, slug, actor, user.email, role)).status).toBe(202);
	expect((await acceptInvite(client, user, findInviteToken(client, user.email))).status).toBe(200);
}
