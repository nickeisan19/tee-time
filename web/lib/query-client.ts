import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

const MAX_RETRIES = 2;

/** Client errors (not found, forbidden, validation) won't fix themselves, so only retry network and server failures. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
	if (error instanceof ApiError && error.status < 500) return false;
	return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: shouldRetry, refetchOnWindowFocus: false },
			mutations: { retry: false },
		},
	});
}
