import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { runDailyTeeSheetGeneration } from '../../../src/features/tee-sheet/scheduled';
import { TEE_SHEET_LIMITS } from '../../../src/features/tee-sheet/limits';
import { createVerifiedUser } from '../../helpers';
import {
	createNineOrFail,
	dailyRules,
	generateTeeSheet,
	type TeeSheet,
	type TeeSheetRule,
	setRules,
	updateTeeTimes,
	viewTeeSheet,
} from '../courses/helpers';
import { addClubStaff, createTierOrFail, data, errorCode, setUpClub } from '../memberships/helpers';

const DATE = '2026-10-05'; // a Monday

async function sheet(setup: Parameters<typeof viewTeeSheet>[0], date = DATE): Promise<TeeSheet> {
	return data<TeeSheet>(await viewTeeSheet(setup, setup.owner, date));
}

describe('tee sheet rules', () => {
	it('replaces a nine’s weekly rules and returns them', async () => {
		const setup = await setUpClub();
		const front = await createNineOrFail(setup, 'Front');
		const rules: TeeSheetRule[] = [
			{ dayOfWeek: 1, firstTee: '07:00', lastTee: '17:00', intervalMinutes: 10, maxPlayers: 4 },
			{ dayOfWeek: 6, firstTee: '06:30', lastTee: '15:00', intervalMinutes: 8, maxPlayers: 4 },
		];

		expect((await setRules(setup, setup.owner, front.id, dailyRules('08:00', '09:00'))).status).toBe(200);
		const response = await setRules(setup, setup.owner, front.id, rules);

		expect(response.status).toBe(200);
		const listed = await setup.client.request(`/api/orgs/${setup.slug}/nines/${front.id}/tee-sheet-rules`, { cookie: setup.owner.cookie });
		expect(await data<TeeSheetRule[]>(listed)).toEqual(rules);
	});

	it.each([
		['a last tee before the first tee', { dayOfWeek: 1, firstTee: '09:00', lastTee: '08:00', intervalMinutes: 10, maxPlayers: 4 }],
		['an invalid time', { dayOfWeek: 1, firstTee: '7am', lastTee: '17:00', intervalMinutes: 10, maxPlayers: 4 }],
		['an interval under 5 minutes', { dayOfWeek: 1, firstTee: '07:00', lastTee: '17:00', intervalMinutes: 4, maxPlayers: 4 }],
		['too many players', { dayOfWeek: 1, firstTee: '07:00', lastTee: '17:00', intervalMinutes: 10, maxPlayers: 7 }],
		['an unknown day', { dayOfWeek: 7, firstTee: '07:00', lastTee: '17:00', intervalMinutes: 10, maxPlayers: 4 }],
	])('rejects %s', async (_label, rule) => {
		const setup = await setUpClub();
		const front = await createNineOrFail(setup, 'Front');

		expect((await setRules(setup, setup.owner, front.id, [rule])).status).toBe(400);
	});

	it('rejects two rules for the same day of the week', async () => {
		const setup = await setUpClub();
		const front = await createNineOrFail(setup, 'Front');
		const rule = { dayOfWeek: 1, firstTee: '07:00', lastTee: '08:00', intervalMinutes: 10, maxPlayers: 4 };

		expect((await setRules(setup, setup.owner, front.id, [rule, rule])).status).toBe(400);
	});

	it('only lets club managers set rules', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const front = await createNineOrFail(setup, 'Front');

		expect((await setRules(setup, staff, front.id, dailyRules('07:00', '08:00'))).status).toBe(403);
	});
});

describe('generating the tee sheet', () => {
	it('creates tee times for every nine and shows them to staff by date', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const front = await createNineOrFail(setup, 'Front');
		const back = await createNineOrFail(setup, 'Back');
		await setRules(setup, setup.owner, front.id, dailyRules('07:00', '07:20', 10));
		await setRules(setup, setup.owner, back.id, dailyRules('07:00', '07:10', 10, 3));

		const response = await generateTeeSheet(setup, setup.owner, { fromDate: DATE, toDate: '2026-10-06' });

		expect(response.status).toBe(200);
		expect(await data<{ created: number }>(response)).toEqual({ created: 10 });
		const teeSheet = await data<TeeSheet>(await viewTeeSheet(setup, staff, DATE));
		expect(teeSheet.date).toBe(DATE);
		expect(teeSheet.nines.map((nine) => [nine.name, nine.teeTimes.map((teeTime) => teeTime.time)])).toEqual([
			['Front', ['07:00', '07:10', '07:20']],
			['Back', ['07:00', '07:10']],
		]);
		expect(teeSheet.nines[1].teeTimes[0]).toEqual({
			id: expect.any(String),
			time: '07:00',
			startsAt: '2026-10-05T12:00:00.000Z',
			maxPlayers: 3,
			bookedPlayers: 0,
			status: 'open',
			membersOnly: false,
		});
	});

	it('never duplicates tee times or undoes staff changes when run again', async () => {
		const setup = await setUpClub();
		const front = await createNineOrFail(setup, 'Front');
		await setRules(setup, setup.owner, front.id, dailyRules('07:00', '07:20', 10));
		await generateTeeSheet(setup, setup.owner, { fromDate: DATE, toDate: DATE });
		await updateTeeTimes(setup, setup.owner, { date: DATE, fromTime: '07:00', toTime: '07:00', status: 'blocked' });

		const again = await generateTeeSheet(setup, setup.owner, { fromDate: DATE, toDate: DATE });

		expect(await data<{ created: number }>(again)).toEqual({ created: 0 });
		const [nine] = (await sheet(setup)).nines;
		expect(nine.teeTimes.map((teeTime) => [teeTime.time, teeTime.status])).toEqual([
			['07:00', 'blocked'],
			['07:10', 'open'],
			['07:20', 'open'],
		]);
	});

	it.each([
		['an end date before the start date', { fromDate: '2026-10-06', toDate: '2026-10-05' }],
		['a range longer than a year', { fromDate: '2026-01-01', toDate: '2027-01-02' }],
		['an invalid date', { fromDate: '2026-02-30', toDate: '2026-03-01' }],
	])('rejects %s', async (_label, body) => {
		const setup = await setUpClub();

		expect((await generateTeeSheet(setup, setup.owner, body)).status).toBe(400);
	});

	it('only lets club managers generate, and only staff view the tee sheet', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const golfer = await createVerifiedUser(setup.client, 'Golfer');

		expect((await generateTeeSheet(setup, staff, { fromDate: DATE, toDate: DATE })).status).toBe(403);
		expect((await viewTeeSheet(setup, golfer, DATE)).status).toBe(403);
	});
});

describe('generation limits', () => {
	it('inserts a large, realistic tee sheet completely', async () => {
		const setup = await setUpClub();
		for (const name of ['Red', 'White', 'Blue']) {
			const nine = await createNineOrFail(setup, name);
			await setRules(setup, setup.owner, nine.id, dailyRules('06:00', '18:56', 8));
		}

		const response = await generateTeeSheet(setup, setup.owner, { fromDate: DATE, toDate: '2026-11-03' });

		// 3 nines x 98 tee times a day x 30 days.
		expect(await data<{ created: number }>(response)).toEqual({ created: 8820 });
	});

	it('refuses a run that would create more tee times than the per-run limit', async () => {
		const setup = await setUpClub();
		const nine = await createNineOrFail(setup, 'Front');
		await setRules(setup, setup.owner, nine.id, dailyRules('00:00', '23:55', 5));

		const response = await generateTeeSheet(setup, setup.owner, { fromDate: '2026-01-01', toDate: '2026-12-31' });

		expect(response.status).toBe(400);
		expect(await errorCode(response)).toBe('VALIDATION_ERROR');
		expect((await sheet(setup, '2026-01-01')).nines[0].teeTimes).toHaveLength(0);
	});

	it('rate limits generation runs per club', async () => {
		const setup = await setUpClub();

		for (let run = 0; run < TEE_SHEET_LIMITS.generateRuns.limit; run++) {
			expect((await generateTeeSheet(setup, setup.owner, { fromDate: DATE, toDate: DATE })).status).toBe(200);
		}
		const overLimit = await generateTeeSheet(setup, setup.owner, { fromDate: DATE, toDate: DATE });

		expect(overLimit.status).toBe(429);
	});

	// Sends one more request than the hourly limit, so it needs longer than the default timeout under full-suite load.
	it('rate limits bulk tee time changes per staff member', { timeout: 120_000 }, async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const change = { date: DATE, fromTime: '07:00', toTime: '08:00', status: 'blocked' };

		for (let attempt = 0; attempt < TEE_SHEET_LIMITS.teeTimeUpdates.limit; attempt++) {
			expect((await updateTeeTimes(setup, staff, change)).status).toBe(200);
		}

		expect((await updateTeeTimes(setup, staff, change)).status).toBe(429);
		expect((await updateTeeTimes(setup, setup.owner, change)).status).toBe(200);
	});
});

describe('blocking tee times', () => {
	it('blocks a time range on selected nines and marks another range members-only', async () => {
		const setup = await setUpClub();
		const staff = await addClubStaff(setup, 'staff');
		const front = await createNineOrFail(setup, 'Front');
		const back = await createNineOrFail(setup, 'Back');
		for (const nine of [front, back]) await setRules(setup, setup.owner, nine.id, dailyRules('07:00', '07:30', 10));
		await generateTeeSheet(setup, setup.owner, { fromDate: DATE, toDate: DATE });

		const blocked = await updateTeeTimes(setup, staff, {
			date: DATE,
			fromTime: '07:00',
			toTime: '07:10',
			nineIds: [front.id],
			status: 'blocked',
		});
		const membersOnly = await updateTeeTimes(setup, staff, { date: DATE, fromTime: '07:20', toTime: '07:30', membersOnly: true });

		expect(await data<{ updated: number }>(blocked)).toEqual({ updated: 2 });
		expect(await data<{ updated: number }>(membersOnly)).toEqual({ updated: 4 });
		const teeSheet = await sheet(setup);
		const summary = (name: string) =>
			teeSheet.nines
				.find((nine) => nine.name === name)!
				.teeTimes.map((teeTime) => `${teeTime.time}:${teeTime.status}${teeTime.membersOnly ? ':members' : ''}`);
		expect(summary('Front')).toEqual(['07:00:blocked', '07:10:blocked', '07:20:open:members', '07:30:open:members']);
		expect(summary('Back')).toEqual(['07:00:open', '07:10:open', '07:20:open:members', '07:30:open:members']);
	});

	it('requires a change and a valid time range', async () => {
		const setup = await setUpClub();

		expect((await updateTeeTimes(setup, setup.owner, { date: DATE, fromTime: '07:00', toTime: '08:00' })).status).toBe(400);
		expect((await updateTeeTimes(setup, setup.owner, { date: DATE, fromTime: '09:00', toTime: '08:00', status: 'blocked' })).status).toBe(
			400,
		);
	});

	it('rejects nines from another club', async () => {
		const setup = await setUpClub();
		const otherClub = await setUpClub('Other Club');
		const foreign = await createNineOrFail(otherClub, 'Foreign');

		const response = await updateTeeTimes(setup, setup.owner, {
			date: DATE,
			fromTime: '07:00',
			toTime: '08:00',
			nineIds: [foreign.id],
			status: 'blocked',
		});

		expect(response.status).toBe(404);
		expect(await errorCode(response)).toBe('NOT_FOUND');
	});

	it('does not let golfers change tee times', async () => {
		const setup = await setUpClub();
		const golfer = await createVerifiedUser(setup.client, 'Golfer');

		expect((await updateTeeTimes(setup, golfer, { date: DATE, fromTime: '07:00', toTime: '08:00', status: 'blocked' })).status).toBe(403);
	});
});

describe('daily tee sheet job', () => {
	it('only adds the days that are new since the last run', async () => {
		const setup = await setUpClub();
		const front = await createNineOrFail(setup, 'Front');
		await setRules(setup, setup.owner, front.id, dailyRules('07:00', '07:00'));

		const firstRun = await runDailyTeeSheetGeneration(env, new Date('2026-10-05T15:00:00Z'));
		const nextDay = await runDailyTeeSheetGeneration(env, new Date('2026-10-06T15:00:00Z'));

		const created = (run: typeof firstRun) => run.clubs.find((club) => club.orgId === setup.clubId)?.created;
		// Default public window is 7 days: Oct 5-12 on the first run, then just Oct 13.
		expect(created(firstRun)).toBe(8);
		expect(created(nextDay)).toBe(1);
	});

	it('fills each club’s tee sheet through its longest booking window, starting today', async () => {
		const setup = await setUpClub();
		const front = await createNineOrFail(setup, 'Front');
		await setRules(setup, setup.owner, front.id, dailyRules('07:00', '07:00'));
		await createTierOrFail(setup, 'Full', 10);
		const now = new Date('2026-10-05T15:00:00Z'); // 10:00 in Chicago

		await runDailyTeeSheetGeneration(env, now);

		const firstDay = await sheet(setup, '2026-10-05');
		const lastDay = await sheet(setup, '2026-10-15');
		const beyond = await sheet(setup, '2026-10-16');
		expect(firstDay.nines[0].teeTimes).toHaveLength(1);
		expect(lastDay.nines[0].teeTimes).toHaveLength(1);
		expect(beyond.nines[0].teeTimes).toHaveLength(0);
	});
});
