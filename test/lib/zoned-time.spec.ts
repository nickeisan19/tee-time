import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, formatClockTime, parseClockTime, zonedTimeToUtc } from '../../src/lib/zoned-time';

describe('clock times', () => {
	it('converts between HH:MM and minutes after midnight', () => {
		expect(parseClockTime('00:00')).toBe(0);
		expect(parseClockTime('07:30')).toBe(450);
		expect(parseClockTime('23:59')).toBe(1439);
		expect(formatClockTime(450)).toBe('07:30');
		expect(formatClockTime(5)).toBe('00:05');
	});

	it.each(['24:00', '7:30', '07:60', 'noon', ''])('rejects %j', (value) => {
		expect(parseClockTime(value)).toBeNull();
	});
});

describe('calendar dates', () => {
	it('adds days across month and year boundaries', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('returns the day of the week with Sunday as 0', () => {
		expect(dayOfWeek('2026-09-13')).toBe(0);
		expect(dayOfWeek('2026-09-15')).toBe(2);
		expect(dayOfWeek('2026-09-19')).toBe(6);
	});
});

describe('zonedTimeToUtc', () => {
	it('converts a club-local time to the right instant in standard and daylight time', () => {
		// Chicago is UTC-6 in January and UTC-5 in July.
		expect(new Date(zonedTimeToUtc('2026-01-15', parseClockTime('07:00')!, 'America/Chicago')!).toISOString()).toBe(
			'2026-01-15T13:00:00.000Z',
		);
		expect(new Date(zonedTimeToUtc('2026-07-15', parseClockTime('07:00')!, 'America/Chicago')!).toISOString()).toBe(
			'2026-07-15T12:00:00.000Z',
		);
	});

	it('returns null for a time skipped when clocks spring forward', () => {
		// On 2026-03-08 New York jumps from 02:00 to 03:00.
		expect(zonedTimeToUtc('2026-03-08', parseClockTime('02:30')!, 'America/New_York')).toBeNull();
		expect(new Date(zonedTimeToUtc('2026-03-08', parseClockTime('03:00')!, 'America/New_York')!).toISOString()).toBe(
			'2026-03-08T07:00:00.000Z',
		);
	});

	it('uses the first occurrence of a time repeated when clocks fall back', () => {
		// On 2026-11-01 New York repeats 01:00-02:00; the first 01:30 is still daylight time (UTC-4).
		expect(new Date(zonedTimeToUtc('2026-11-01', parseClockTime('01:30')!, 'America/New_York')!).toISOString()).toBe(
			'2026-11-01T05:30:00.000Z',
		);
	});

	it('handles timezones east of UTC', () => {
		expect(new Date(zonedTimeToUtc('2026-06-01', parseClockTime('06:00')!, 'Australia/Sydney')!).toISOString()).toBe(
			'2026-05-31T20:00:00.000Z',
		);
	});

	it.each([
		['Asia/Kathmandu (UTC+5:45)', 'Asia/Kathmandu', '2026-06-01', '07:00', '2026-06-01T01:15:00.000Z'],
		['Pacific/Kiritimati (UTC+14)', 'Pacific/Kiritimati', '2026-06-01', '07:00', '2026-05-31T17:00:00.000Z'],
		['America/St_Johns in summer (UTC-2:30)', 'America/St_Johns', '2026-07-01', '07:00', '2026-07-01T09:30:00.000Z'],
		['America/St_Johns in winter (UTC-3:30)', 'America/St_Johns', '2026-01-15', '07:00', '2026-01-15T10:30:00.000Z'],
	])('handles %s', (_label, timezone, date, time, expected) => {
		expect(new Date(zonedTimeToUtc(date, parseClockTime(time)!, timezone)!).toISOString()).toBe(expected);
	});
});
