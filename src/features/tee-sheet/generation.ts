import type { IsoDate } from '../../lib/dates';
import { addDays, dayOfWeek, formatClockTime, zonedTimeToUtc } from '../../lib/zoned-time';

export interface WeeklyRule {
	dayOfWeek: number;
	firstTeeMinute: number;
	lastTeeMinute: number;
	intervalMinutes: number;
	maxPlayers: number;
}

export interface NineSchedule {
	nineId: string;
	rules: readonly WeeklyRule[];
}

export interface TeeTimeSlot {
	nineId: string;
	localDate: IsoDate;
	localTime: string;
	startsAt: number;
	maxPlayers: number;
}

interface GenerationRequest {
	timezone: string;
	fromDate: IsoDate;
	toDate: IsoDate;
	nines: readonly NineSchedule[];
}

/** The tee times the weekly rules produce on one club-local date. */
export function slotsForDate(date: IsoDate, timezone: string, nines: readonly NineSchedule[]): TeeTimeSlot[] {
	const weekday = dayOfWeek(date);
	const slots: TeeTimeSlot[] = [];
	for (const nine of nines) {
		const rule = nine.rules.find((candidate) => candidate.dayOfWeek === weekday);
		if (!rule) continue;
		for (let minute = rule.firstTeeMinute; minute <= rule.lastTeeMinute; minute += rule.intervalMinutes) {
			const startsAt = zonedTimeToUtc(date, minute, timezone);
			// Skipped when clocks spring forward: that local time never happens.
			if (startsAt === null) continue;
			slots.push({ nineId: nine.nineId, localDate: date, localTime: formatClockTime(minute), startsAt, maxPlayers: rule.maxPlayers });
		}
	}
	return slots;
}

/** How many tee times the rules produce on one date, without building them (ignores DST gaps). */
export function countSlotsForDate(date: IsoDate, nines: readonly NineSchedule[]): number {
	const weekday = dayOfWeek(date);
	let count = 0;
	for (const nine of nines) {
		const rule = nine.rules.find((candidate) => candidate.dayOfWeek === weekday);
		if (rule) count += Math.floor((rule.lastTeeMinute - rule.firstTeeMinute) / rule.intervalMinutes) + 1;
	}
	return count;
}

/** Every tee time the weekly rules produce between two club-local dates, inclusive. */
export function generateTeeTimeSlots({ timezone, fromDate, toDate, nines }: GenerationRequest): TeeTimeSlot[] {
	const slots: TeeTimeSlot[] = [];
	for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
		slots.push(...slotsForDate(date, timezone, nines));
	}
	return slots;
}

/** How many tee times a range would produce, cheaply, for enforcing limits before generating. */
export function countTeeTimeSlots({ fromDate, toDate, nines }: GenerationRequest): number {
	let count = 0;
	for (let date = fromDate; date <= toDate; date = addDays(date, 1)) count += countSlotsForDate(date, nines);
	return count;
}
