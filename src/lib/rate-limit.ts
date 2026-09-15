import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { rateLimits } from '../db/schema';
import { AppError } from './errors';
import { hmacSha256Hex } from './tokens';

export interface RateLimitRule {
	readonly name: string;
	readonly limit: number;
	readonly windowSeconds: number;
}

export interface RateLimitCheck {
	rule: RateLimitRule;
	/** Who or what is being limited (a user id, club id, or hashed email). Never raw personal data. */
	subject: string;
	/** How much this attempt uses up (default 1), e.g. the number of players in a booking. */
	cost?: number;
}

export interface RateLimiter {
	/** Counts one attempt against every check and throws RateLimitedError if any limit is exceeded. */
	enforce(checks: readonly RateLimitCheck[], nowMs?: number): Promise<void>;
	/** Keyed hash for subjects that are personal data (like emails), so stored keys can't be reversed. */
	hashSubject(value: string): Promise<string>;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
// Namespaced so app limits never collide with Better Auth's keys in the same table.
const KEY_PREFIX = 'app';
const SUBJECT_HASH_CONTEXT = 'rate-limit-subject:';

function describeWait(seconds: number): string {
	if (seconds < SECONDS_PER_MINUTE) return `${seconds} seconds`;
	if (seconds < SECONDS_PER_HOUR) return `${Math.ceil(seconds / SECONDS_PER_MINUTE)} minutes`;
	return `${Math.ceil(seconds / SECONDS_PER_HOUR)} hours`;
}

export class RateLimitedError extends AppError {
	constructor(
		readonly retryAfterSeconds: number,
		readonly ruleNames: readonly string[],
	) {
		super(429, 'RATE_LIMITED', `Too many attempts. Try again in ${describeWait(retryAfterSeconds)}.`);
		this.name = 'RateLimitedError';
	}
}

/**
 * Fixed-window counters stored in D1 so limits hold across Worker isolates. Each check is a single
 * atomic upsert, and all checks for one action run in one batch.
 */
export function createRateLimiter(db: Database, secret: string): RateLimiter {
	return {
		hashSubject: (value) => hmacSha256Hex(secret, `${SUBJECT_HASH_CONTEXT}${value}`),

		async enforce(checks, nowMs = Date.now()) {
			if (checks.length === 0) return;

			const statements = checks.map(({ rule, subject, cost = 1 }) => {
				const windowExpired = sql`${rateLimits.lastRequest} <= ${nowMs - rule.windowSeconds * 1000}`;
				return (
					db
						.insert(rateLimits)
						// For app keys, last_request holds the start of the current window.
						.values({ key: `${KEY_PREFIX}:${rule.name}:${subject}`, count: cost, lastRequest: nowMs })
						.onConflictDoUpdate({
							target: rateLimits.key,
							set: {
								count: sql`CASE WHEN ${windowExpired} THEN ${cost} ELSE ${rateLimits.count} + ${cost} END`,
								lastRequest: sql`CASE WHEN ${windowExpired} THEN ${nowMs} ELSE ${rateLimits.lastRequest} END`,
							},
						})
						.returning({ count: rateLimits.count, windowStartedAt: rateLimits.lastRequest })
				);
			});
			const results = await db.batch(statements as [(typeof statements)[number], ...typeof statements]);

			const exceeded = checks.flatMap((check, index) => {
				const [counter] = results[index];
				if (!counter || counter.count <= check.rule.limit) return [];
				const windowEndsAt = counter.windowStartedAt + check.rule.windowSeconds * 1000;
				return [{ name: check.rule.name, retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - nowMs) / 1000)) }];
			});
			if (exceeded.length > 0) {
				throw new RateLimitedError(
					Math.max(...exceeded.map((limit) => limit.retryAfterSeconds)),
					exceeded.map((limit) => limit.name),
				);
			}
		},
	};
}
