import { describe, expect, it } from 'vitest';
import {
	type AvailabilityNine,
	type AvailabilityRoute,
	type AvailabilityTeeTime,
	CROSSOVER_WINDOW_MINUTES,
	eighteenHoleOptions,
	findCrossover,
	isBookable,
	nineHoleOptions,
} from '../../../src/features/bookings/availability';

const MINUTE = 60_000;
const SEVEN_AM = Date.parse('2026-10-05T12:00:00Z');

const front: AvailabilityNine = { id: 'front', name: 'Front', turnMinutes: 120 };
const back: AvailabilityNine = { id: 'back', name: 'Back', turnMinutes: 130 };
const route: AvailabilityRoute = { id: 'championship', name: 'Championship', nineIds: ['back', 'front'] };

function teeTime(id: string, nineId: string, minutesAfterSeven: number, overrides: Partial<AvailabilityTeeTime> = {}): AvailabilityTeeTime {
	const startsAt = SEVEN_AM + minutesAfterSeven * MINUTE;
	return { id, nineId, startsAt, maxPlayers: 4, bookedPlayers: 0, status: 'open', membersOnly: false, ...overrides };
}

describe('isBookable', () => {
	it('needs an open tee time with room for the whole group', () => {
		expect(isBookable(teeTime('a', 'front', 0, { bookedPlayers: 2 }), 2, false)).toBe(true);
		expect(isBookable(teeTime('a', 'front', 0, { bookedPlayers: 3 }), 2, false)).toBe(false);
		expect(isBookable(teeTime('a', 'front', 0, { status: 'blocked' }), 1, true)).toBe(false);
	});

	it('only lets members book members-only tee times', () => {
		const membersOnly = teeTime('a', 'front', 0, { membersOnly: true });

		expect(isBookable(membersOnly, 1, true)).toBe(true);
		expect(isBookable(membersOnly, 1, false)).toBe(false);
	});
});

describe('findCrossover', () => {
	it('picks the first bookable tee time on the other nine at or after the turn', () => {
		const start = teeTime('start', 'front', 0);
		const teeTimes = [
			teeTime('too-early', 'back', 110),
			teeTime('full', 'back', 120, { bookedPlayers: 4 }),
			teeTime('crossover', 'back', 130),
			teeTime('later', 'back', 140),
		];

		expect(findCrossover(start, front, 'back', teeTimes, 1, false)?.id).toBe('crossover');
	});

	it('uses the start nine’s turn time', () => {
		const start = teeTime('start', 'back', 0);
		const teeTimes = [teeTime('at-120', 'front', 120), teeTime('at-130', 'front', 130)];

		// Starting on the back nine (130 minute turn) skips the 120-minute tee time.
		expect(findCrossover(start, back, 'front', teeTimes, 1, false)?.id).toBe('at-130');
	});

	it('gives up when nothing is bookable within the crossover window', () => {
		const start = teeTime('start', 'front', 0);
		const teeTimes = [teeTime('too-late', 'back', 120 + CROSSOVER_WINDOW_MINUTES), teeTime('members', 'back', 125, { membersOnly: true })];

		expect(findCrossover(start, front, 'back', teeTimes, 1, false)).toBeNull();
	});
});

describe('nineHoleOptions', () => {
	it('lists bookable tee times in time order', () => {
		const teeTimes = [teeTime('b', 'back', 10), teeTime('full', 'front', 5, { bookedPlayers: 4 }), teeTime('a', 'front', 0)];

		expect(nineHoleOptions(teeTimes, 1, false).map((option) => option.teeTime.id)).toEqual(['a', 'b']);
	});
});

describe('eighteenHoleOptions', () => {
	it('offers both starting nines of a route, each with its crossover', () => {
		const teeTimes = [
			teeTime('front-7:00', 'front', 0),
			teeTime('back-7:00', 'back', 0),
			teeTime('back-9:00', 'back', 120),
			teeTime('front-9:10', 'front', 130),
		];

		const options = eighteenHoleOptions(teeTimes, [front, back], [route], 2, false);

		expect(options.map((option) => [option.start.id, option.crossover.id, option.route.id])).toEqual([
			['front-7:00', 'back-9:00', 'championship'],
			['back-7:00', 'front-9:10', 'championship'],
		]);
	});

	it('skips starts whose crossover has no room for the group', () => {
		const teeTimes = [teeTime('front-7:00', 'front', 0), teeTime('back-9:00', 'back', 120, { bookedPlayers: 3 })];

		expect(eighteenHoleOptions(teeTimes, [front, back], [route], 2, false)).toEqual([]);
	});
});
