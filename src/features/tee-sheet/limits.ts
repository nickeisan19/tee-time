import type { RateLimitRule } from '../../lib/rate-limit';

const SECONDS_PER_HOUR = 3600;

/**
 * Guards for tee sheet generation, sized against D1's limits (100 KB per statement, 1000 queries
 * per Worker invocation on the paid plan) and Worker CPU time.
 */
export const TEE_SHEET_LIMITS = {
	/** Shortest allowed gap between tee times. */
	minIntervalMinutes: 5,
	/** Most tee times one on-demand generation run may create. */
	maxSlotsPerRun: 50_000,
	/** Most tee times the daily job considers across all clubs in one invocation. */
	dailyJobSlotBudget: 200_000,
	/** Largest JSON payload per insert statement, kept well under D1's 100 KB statement limit. */
	maxInsertJsonBytes: 60_000,
	/** Tee times held in memory before they are written. */
	flushEverySlots: 400,
	generateRuns: { name: 'tee-sheet-generate', limit: 20, windowSeconds: SECONDS_PER_HOUR } satisfies RateLimitRule,
	teeTimeUpdates: { name: 'tee-time-update', limit: 120, windowSeconds: SECONDS_PER_HOUR } satisfies RateLimitRule,
} as const;
