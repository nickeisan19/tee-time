import { describe, expect, it } from 'vitest';
import { clubToday } from '../../src/lib/dates';

describe('clubToday', () => {
	it('returns the calendar date in the club’s timezone, not UTC', () => {
		// 03:30 UTC on Sep 15 is still 22:30 on Sep 14 in Chicago.
		const instant = new Date('2026-09-15T03:30:00Z');

		expect(clubToday('America/Chicago', instant)).toBe('2026-09-14');
		expect(clubToday('Europe/London', instant)).toBe('2026-09-15');
	});

	it('pads single-digit months and days', () => {
		expect(clubToday('UTC', new Date('2027-01-05T12:00:00Z'))).toBe('2027-01-05');
	});
});
