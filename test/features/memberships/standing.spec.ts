import { describe, expect, it } from 'vitest';
import { bookingWindowDays, membershipState } from '../../../src/features/memberships/standing';

const TODAY = '2026-09-15';

describe('membershipState', () => {
	it('is "none" without a membership', () => {
		expect(membershipState(null, TODAY)).toBe('none');
	});

	it.each([
		['pending', 'pending'],
		['denied', 'denied'],
		['suspended', 'suspended'],
		['cancelled', 'cancelled'],
	] as const)('reports a %s membership as %s regardless of dates', (status, expected) => {
		expect(membershipState({ status, startsOn: '2000-01-01', endsOn: null }, TODAY)).toBe(expected);
	});

	it('is active from the start date through the end date, inclusive', () => {
		expect(membershipState({ status: 'active', startsOn: TODAY, endsOn: TODAY }, TODAY)).toBe('active');
		expect(membershipState({ status: 'active', startsOn: '2026-01-01', endsOn: null }, TODAY)).toBe('active');
	});

	it('is not_started before the start date', () => {
		expect(membershipState({ status: 'active', startsOn: '2026-09-16', endsOn: null }, TODAY)).toBe('not_started');
	});

	it('is expired after the end date', () => {
		expect(membershipState({ status: 'active', startsOn: '2026-01-01', endsOn: '2026-09-14' }, TODAY)).toBe('expired');
	});
});

describe('bookingWindowDays', () => {
	const PUBLIC_WINDOW = 3;
	const TIER_WINDOW = 14;

	it('uses the tier window for an active member', () => {
		expect(bookingWindowDays('active', TIER_WINDOW, PUBLIC_WINDOW)).toBe(TIER_WINDOW);
	});

	it.each(['none', 'pending', 'denied', 'not_started', 'expired', 'suspended', 'cancelled'] as const)(
		'uses the public window when the membership is %s',
		(state) => {
			expect(bookingWindowDays(state, TIER_WINDOW, PUBLIC_WINDOW)).toBe(PUBLIC_WINDOW);
		},
	);

	it('falls back to the public window if an active member has no tier', () => {
		expect(bookingWindowDays('active', null, PUBLIC_WINDOW)).toBe(PUBLIC_WINDOW);
	});
});
