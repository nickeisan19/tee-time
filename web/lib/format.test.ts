import { describe, expect, it } from 'vitest';
import { clockLabel, dayOfMonth, formatMoney, longDate, shortDate, weekdayShort } from './format';

describe('format', () => {
	it('formats money and missing prices', () => {
		expect(formatMoney(6500)).toBe('$65.00');
		expect(formatMoney(0)).toBe('$0.00');
		expect(formatMoney(null)).toBe('Price at pro shop');
	});

	it('formats club-local dates without shifting them across timezones', () => {
		expect(weekdayShort('2026-10-05')).toBe('Mon');
		expect(longDate('2026-10-05')).toBe('Monday, October 5');
		expect(shortDate('2026-10-05')).toBe('Oct 5');
		expect(dayOfMonth('2026-10-05')).toBe('5');
	});

	it('formats 24-hour tee times for golfers', () => {
		expect(clockLabel('07:30')).toBe('7:30 AM');
		expect(clockLabel('12:05')).toBe('12:05 PM');
		expect(clockLabel('00:00')).toBe('12:00 AM');
		expect(clockLabel('15:10')).toBe('3:10 PM');
	});
});
