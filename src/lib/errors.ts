import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ErrorCode =
	'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'SLUG_TAKEN' | 'ALREADY_STAFF' | 'LAST_OWNER' | 'INTERNAL_ERROR';

/** An expected failure whose code and message are safe to show to the client. */
export class AppError extends Error {
	constructor(
		readonly status: ContentfulStatusCode,
		readonly code: ErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'AppError';
	}
}

export const validationError = (message: string) => new AppError(400, 'VALIDATION_ERROR', message);
export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
export const forbidden = (message = 'You do not have permission to do that') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message);
