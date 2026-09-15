import type { RateLimitRule } from '../../lib/rate-limit';

const SECONDS_PER_HOUR = 3600;

/**
 * Limits keyed only by the requesting golfer. There is deliberately no shared per-club bucket:
 * any signed-in user can request membership, so a club-wide limit would let a few throwaway
 * accounts lock real golfers out of requesting. Each account can hold only one request per club.
 */
export const MEMBERSHIP_REQUEST_RATE_LIMITS = {
	requester: { name: 'membership-request-user', limit: 5, windowSeconds: SECONDS_PER_HOUR },
} as const satisfies Record<string, RateLimitRule>;
