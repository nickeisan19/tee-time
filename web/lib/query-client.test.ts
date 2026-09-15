import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { createQueryClient, shouldRetry } from './query-client';

describe('shouldRetry', () => {
	it('does not retry client errors', () => {
		expect(shouldRetry(0, new ApiError(404, 'NOT_FOUND', 'Missing'))).toBe(false);
		expect(shouldRetry(0, new ApiError(429, 'RATE_LIMITED', 'Slow down'))).toBe(false);
	});

	it('retries server and network failures a limited number of times', () => {
		expect(shouldRetry(0, new ApiError(503, 'UNAVAILABLE', 'Down'))).toBe(true);
		expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
		expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(false);
	});
});

describe('createQueryClient', () => {
	it('uses the retry policy and never retries mutations', () => {
		const options = createQueryClient().getDefaultOptions();

		expect(options.queries?.retry).toBe(shouldRetry);
		expect(options.mutations?.retry).toBe(false);
	});
});
