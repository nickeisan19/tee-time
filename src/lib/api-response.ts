import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorCode } from './errors';

/** Envelope for every app-owned API response (Better Auth routes use their own format). */
export interface ApiResponse<T> {
	success: boolean;
	data: T | null;
	error: { code: ErrorCode; message: string } | null;
}

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
	return c.json<ApiResponse<T>>({ success: true, data, error: null }, status);
}

export function errorBody(code: ErrorCode, message: string): ApiResponse<null> {
	return { success: false, data: null, error: { code, message } };
}
