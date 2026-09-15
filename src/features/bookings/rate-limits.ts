import type { RateLimitRule } from '../../lib/rate-limit';

const SECONDS_PER_HOUR = 3600;

/**
 * Stops one account from hoarding tee times. Guests are free-text names and there is no payment at
 * booking time, so player spots are capped as well as bookings.
 */
export const BOOKING_RATE_LIMITS = {
	booker: { name: 'booking-create', limit: 10, windowSeconds: SECONDS_PER_HOUR },
	playerSpots: { name: 'booking-player-spots', limit: 24, windowSeconds: SECONDS_PER_HOUR },
} as const satisfies Record<string, RateLimitRule>;
