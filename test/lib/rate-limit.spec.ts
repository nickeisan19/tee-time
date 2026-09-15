import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import { createRateLimiter, RateLimitedError, type RateLimitRule } from '../../src/lib/rate-limit';
import { sha256Hex } from '../../src/lib/tokens';

const db = createDb(env.DB);
const TEST_SECRET = 'rate-limit-test-secret-at-least-32-chars';
const limiter = createRateLimiter(db, TEST_SECRET);

function uniqueRule(limit: number, windowSeconds = 60): RateLimitRule {
	return { name: `test-${crypto.randomUUID()}`, limit, windowSeconds };
}

const START = Date.UTC(2026, 8, 15, 12, 0, 0);

describe('rate limiter', () => {
	it('allows up to the limit within a window, then rejects with a retry time', async () => {
		const rule = uniqueRule(2, 60);

		await limiter.enforce([{ rule, subject: 'alice' }], START);
		await limiter.enforce([{ rule, subject: 'alice' }], START + 1_000);
		const third = limiter.enforce([{ rule, subject: 'alice' }], START + 10_000);

		await expect(third).rejects.toBeInstanceOf(RateLimitedError);
		await expect(limiter.enforce([{ rule, subject: 'alice' }], START + 10_000)).rejects.toMatchObject({
			status: 429,
			code: 'RATE_LIMITED',
			retryAfterSeconds: 50,
		});
	});

	it('starts a fresh window once the previous one has passed', async () => {
		const rule = uniqueRule(1, 60);
		await limiter.enforce([{ rule, subject: 'alice' }], START);
		await expect(limiter.enforce([{ rule, subject: 'alice' }], START + 30_000)).rejects.toBeInstanceOf(RateLimitedError);

		await expect(limiter.enforce([{ rule, subject: 'alice' }], START + 60_000)).resolves.toBeUndefined();
	});

	it('counts each subject separately', async () => {
		const rule = uniqueRule(1);
		await limiter.enforce([{ rule, subject: 'alice' }], START);

		await expect(limiter.enforce([{ rule, subject: 'bob' }], START)).resolves.toBeUndefined();
	});

	it('rejects when any one of several limits is exceeded and reports the longest wait', async () => {
		const shortRule = uniqueRule(5, 60);
		const longRule = uniqueRule(1, 3600);
		await limiter.enforce([{ rule: longRule, subject: 'alice' }], START);

		await expect(
			limiter.enforce(
				[
					{ rule: shortRule, subject: 'alice' },
					{ rule: longRule, subject: 'alice' },
				],
				START + 600_000,
			),
		).rejects.toMatchObject({ retryAfterSeconds: 3000 });
	});

	it('hashes personal-data subjects with a secret so stored keys cannot be reversed from a list of emails', async () => {
		const email = 'golfer@example.com';

		const hashed = await limiter.hashSubject(email);

		expect(hashed).toBe(await limiter.hashSubject(email));
		expect(hashed).not.toContain(email);
		expect(hashed).not.toBe(await sha256Hex(email));
		expect(hashed).not.toBe(await createRateLimiter(db, 'a-different-secret-that-is-32-chars').hashSubject(email));
	});

	it('counts weighted attempts against the limit', async () => {
		const rule = uniqueRule(10);
		await limiter.enforce([{ rule, subject: 'alice', cost: 6 }], START);

		await expect(limiter.enforce([{ rule, subject: 'alice', cost: 4 }], START)).resolves.toBeUndefined();
		await expect(limiter.enforce([{ rule, subject: 'alice', cost: 1 }], START)).rejects.toBeInstanceOf(RateLimitedError);
	});
});
