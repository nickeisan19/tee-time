import { describe, expect, it } from 'vitest';
import { dayTypeOf, findRate, type RateCard } from '../../../src/features/rates/pricing';

const rates: RateCard = [
	{ holes: 18, audience: 'public', tierId: null, dayType: 'weekday', amountCents: 6500 },
	{ holes: 18, audience: 'public', tierId: null, dayType: 'weekend', amountCents: 8500 },
	{ holes: 18, audience: 'member', tierId: 'gold', dayType: 'weekday', amountCents: 0 },
	{ holes: 18, audience: 'member_guest', tierId: 'gold', dayType: 'weekday', amountCents: 4000 },
	{ holes: 18, audience: 'member_guest', tierId: 'silver', dayType: 'weekday', amountCents: 5000 },
	{ holes: 9, audience: 'public', tierId: null, dayType: 'weekday', amountCents: 3500 },
];

describe('dayTypeOf', () => {
	it('treats Saturday and Sunday as the weekend', () => {
		expect(dayTypeOf('2026-09-12')).toBe('weekend');
		expect(dayTypeOf('2026-09-13')).toBe('weekend');
		expect(dayTypeOf('2026-09-14')).toBe('weekday');
		expect(dayTypeOf('2026-09-18')).toBe('weekday');
	});
});

describe('findRate', () => {
	it('prices the public by holes and day type', () => {
		expect(findRate(rates, { holes: 18, audience: 'public', tierId: null, dayType: 'weekend' })).toBe(8500);
		expect(findRate(rates, { holes: 9, audience: 'public', tierId: null, dayType: 'weekday' })).toBe(3500);
	});

	it('prices members and their guests by the member’s tier', () => {
		expect(findRate(rates, { holes: 18, audience: 'member', tierId: 'gold', dayType: 'weekday' })).toBe(0);
		expect(findRate(rates, { holes: 18, audience: 'member_guest', tierId: 'gold', dayType: 'weekday' })).toBe(4000);
		expect(findRate(rates, { holes: 18, audience: 'member_guest', tierId: 'silver', dayType: 'weekday' })).toBe(5000);
	});

	it('returns null when the club has not set a price for that combination', () => {
		expect(findRate(rates, { holes: 9, audience: 'public', tierId: null, dayType: 'weekend' })).toBeNull();
		expect(findRate(rates, { holes: 18, audience: 'member', tierId: 'silver', dayType: 'weekday' })).toBeNull();
	});
});
