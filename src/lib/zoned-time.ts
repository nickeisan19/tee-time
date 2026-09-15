import type { IsoDate } from './dates';

export const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after midnight for a 24-hour `HH:MM` time, or null if it isn't one. */
export function parseClockTime(value: string): number | null {
	const match = CLOCK_TIME_PATTERN.exec(value);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function formatClockTime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function dateParts(date: IsoDate): [number, number, number] {
	const [year, month, day] = date.split('-').map(Number);
	return [year, month, day];
}

export function addDays(date: IsoDate, days: number): IsoDate {
	const [year, month, day] = dateParts(date);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
	const [year, month, day] = dateParts(date);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
	const [fromYear, fromMonth, fromDay] = dateParts(from);
	const [toYear, toMonth, toDay] = dateParts(to);
	return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / MS_PER_DAY);
}

// Creating an Intl.DateTimeFormat is far more expensive than using one, and tee sheet generation
// converts thousands of times per run, so keep one formatter per timezone.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timezone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
		});
		formatters.set(timezone, formatter);
	}
	return formatter;
}

/** How far the timezone's wall clock is ahead of UTC at a given instant, in milliseconds. */
function utcOffsetMs(timezone: string, instantMs: number): number {
	const parts = formatterFor(timezone).formatToParts(new Date(instantMs));
	const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((candidate) => candidate.type === type)?.value);
	const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
	return wallClockAsUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * The UTC instant (epoch ms) when a club-local date and time occurs. Returns null for a time that
 * doesn't exist because clocks sprang forward; for a time repeated when clocks fall back, returns
 * the first occurrence.
 */
export function zonedTimeToUtc(date: IsoDate, minutes: number, timezone: string): number | null {
	const [year, month, day] = dateParts(date);
	const wallClockMs = Date.UTC(year, month - 1, day, 0, minutes);
	// The offsets 12 hours either side cover both possible offsets around a DST change.
	const candidates = [utcOffsetMs(timezone, wallClockMs - 12 * MS_PER_HOUR), utcOffsetMs(timezone, wallClockMs + 12 * MS_PER_HOUR)]
		.map((offset) => wallClockMs - offset)
		.filter((instant) => instant + utcOffsetMs(timezone, instant) === wallClockMs);
	return candidates.length > 0 ? Math.min(...candidates) : null;
}
