import { describe, expect, it } from 'vitest';
import { countTeeTimeSlots, generateTeeTimeSlots, type NineSchedule } from '../../../src/features/tee-sheet/generation';
import { chunkRowsByJsonSize } from '../../../src/features/tee-sheet/repository';

// 2026-09-14 is a Monday (day 1).
const MONDAY = '2026-09-14';

function schedule(nineId: string, rules: NineSchedule['rules']): NineSchedule {
	return { nineId, rules };
}

describe('generateTeeTimeSlots', () => {
	it('creates slots from the first to the last tee time, inclusive, at the interval', () => {
		const slots = generateTeeTimeSlots({
			timezone: 'America/Chicago',
			fromDate: MONDAY,
			toDate: MONDAY,
			nines: [schedule('front', [{ dayOfWeek: 1, firstTeeMinute: 420, lastTeeMinute: 450, intervalMinutes: 10, maxPlayers: 4 }])],
		});

		expect(slots.map((slot) => slot.localTime)).toEqual(['07:00', '07:10', '07:20', '07:30']);
		expect(slots[0]).toEqual({
			nineId: 'front',
			localDate: MONDAY,
			localTime: '07:00',
			startsAt: Date.parse('2026-09-14T12:00:00Z'),
			maxPlayers: 4,
		});
	});

	it('only uses the rule for each date’s day of the week and skips days without one', () => {
		const slots = generateTeeTimeSlots({
			timezone: 'UTC',
			fromDate: '2026-09-13',
			toDate: '2026-09-15',
			nines: [
				schedule('front', [
					{ dayOfWeek: 0, firstTeeMinute: 360, lastTeeMinute: 360, intervalMinutes: 10, maxPlayers: 4 },
					{ dayOfWeek: 2, firstTeeMinute: 480, lastTeeMinute: 480, intervalMinutes: 10, maxPlayers: 2 },
				]),
			],
		});

		expect(slots.map((slot) => [slot.localDate, slot.localTime, slot.maxPlayers])).toEqual([
			['2026-09-13', '06:00', 4],
			['2026-09-15', '08:00', 2],
		]);
	});

	it('generates each nine independently', () => {
		const rule = { dayOfWeek: 1, firstTeeMinute: 420, lastTeeMinute: 420, intervalMinutes: 10, maxPlayers: 4 };

		const slots = generateTeeTimeSlots({
			timezone: 'UTC',
			fromDate: MONDAY,
			toDate: MONDAY,
			nines: [schedule('red', [rule]), schedule('white', [rule])],
		});

		expect(slots.map((slot) => slot.nineId)).toEqual(['red', 'white']);
	});

	it('skips tee times that do not exist when clocks spring forward', () => {
		// 2026-03-08 is a Sunday; New York skips 02:00-03:00.
		const slots = generateTeeTimeSlots({
			timezone: 'America/New_York',
			fromDate: '2026-03-08',
			toDate: '2026-03-08',
			nines: [schedule('front', [{ dayOfWeek: 0, firstTeeMinute: 90, lastTeeMinute: 210, intervalMinutes: 30, maxPlayers: 4 }])],
		});

		expect(slots.map((slot) => slot.localTime)).toEqual(['01:30', '03:00', '03:30']);
	});
});

describe('countTeeTimeSlots', () => {
	it('counts the slots a range would create without building them', () => {
		const rules = [
			{ dayOfWeek: 1, firstTeeMinute: 420, lastTeeMinute: 450, intervalMinutes: 10, maxPlayers: 4 },
			{ dayOfWeek: 2, firstTeeMinute: 420, lastTeeMinute: 420, intervalMinutes: 10, maxPlayers: 4 },
		];
		const request = { timezone: 'UTC', fromDate: '2026-09-14', toDate: '2026-09-22', nines: [schedule('a', rules), schedule('b', rules)] };

		// Two Mondays (4 slots each) and two Tuesdays (1 slot each), on two nines.
		expect(countTeeTimeSlots(request)).toBe(20);
		expect(countTeeTimeSlots(request)).toBe(generateTeeTimeSlots(request).length);
	});
});

describe('chunkRowsByJsonSize', () => {
	it('keeps every chunk under the byte budget and preserves every row in order', () => {
		const rows = Array.from({ length: 3000 }, (_, index) => [crypto.randomUUID(), crypto.randomUUID(), 1_800_000_000_000 + index, '2026-10-05', '07:00', 4]);
		const budget = 20_000;

		const chunks = chunkRowsByJsonSize(rows, budget);

		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) expect(new TextEncoder().encode(JSON.stringify(chunk)).length).toBeLessThanOrEqual(budget);
		expect(chunks.flat()).toEqual(rows);
	});
});
