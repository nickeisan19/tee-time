/** Error from the app API, carrying the server's error code for specific handling in the UI. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

interface Envelope<T> {
	success: boolean;
	data: T | null;
	error: { code: string; message: string } | null;
}

interface RequestOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	body?: unknown;
	signal?: AbortSignal;
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

/** Calls an app endpoint (`/api/...`) and unwraps the `{ success, data, error }` envelope. */
export async function apiRequest<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
	const response = await fetch(`/api${path}`, {
		method,
		signal,
		credentials: 'same-origin',
		headers: body === undefined ? undefined : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const payload = (await readJson(response)) as Envelope<T> | null;

	if (!response.ok || !payload?.success) {
		throw new ApiError(response.status, payload?.error?.code ?? 'UNKNOWN', payload?.error?.message ?? FALLBACK_MESSAGE);
	}
	return payload.data as T;
}

/** Calls a Better Auth endpoint (`/api/auth/...`), which responds with plain JSON rather than the envelope. */
export async function authRequest<T>(path: string, { method = 'POST', body }: RequestOptions = {}): Promise<T> {
	const response = await fetch(`/api/auth${path}`, {
		method,
		credentials: 'same-origin',
		headers: body === undefined ? undefined : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const payload = (await readJson(response)) as (T & { code?: string; message?: string }) | null;

	if (!response.ok) {
		throw new ApiError(response.status, payload?.code ?? 'UNKNOWN', payload?.message ?? FALLBACK_MESSAGE);
	}
	return payload as T;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error && error.message ? error.message : FALLBACK_MESSAGE;
}
