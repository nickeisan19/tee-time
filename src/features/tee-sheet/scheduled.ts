import { createDb } from '../../db/client';
import { clubToday, type IsoDate } from '../../lib/dates';
import { createLogger, type Logger } from '../../lib/logger';
import { addDays } from '../../lib/zoned-time';
import { countSlotsForDate, type NineSchedule } from './generation';
import { TEE_SHEET_LIMITS } from './limits';
import { createTeeSheetRepository } from './repository';
import { generateForClub } from './tee-sheet-service';
import { MAX_GENERATION_DAYS } from './validation';

export interface DailyGenerationSummary {
	clubs: { orgId: string; fromDate: IsoDate; toDate: IsoDate | null; created: number }[];
}

/** The furthest date from `fromDate` whose cumulative tee times fit in `budget`, with that count. */
function rangeWithinBudget(
	schedules: readonly NineSchedule[],
	fromDate: IsoDate,
	toDate: IsoDate,
	budget: number,
): { toDate: IsoDate | null; slots: number } {
	let lastFitting: IsoDate | null = null;
	let used = 0;
	for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
		const withDate = used + countSlotsForDate(date, schedules);
		if (withDate > budget) break;
		used = withDate;
		lastFitting = date;
	}
	return { toDate: lastFitting, slots: used };
}

/**
 * Daily job (Cron Trigger): fills each club's tee sheet through its longest booking window so every
 * tee time a golfer may book exists. Each club resumes from its newest generated day, so a normal
 * run writes about one new day per club. A shared budget keeps one invocation within D1's query
 * limits; anything left over is picked up by the next run. Safe to re-run.
 */
export async function runDailyTeeSheetGeneration(
	env: Env,
	now: Date = new Date(),
	logger: Logger = createLogger({ job: 'tee-sheet' }),
): Promise<DailyGenerationSummary> {
	const teeSheets = createTeeSheetRepository(createDb(env.DB));
	const summary: DailyGenerationSummary = { clubs: [] };
	let remainingBudget: number = TEE_SHEET_LIMITS.dailyJobSlotBudget;

	for (const club of await teeSheets.clubsWithRules()) {
		const today = clubToday(club.timezone, now);
		const horizonDays = Math.min(MAX_GENERATION_DAYS, Math.max(club.publicBookingWindowDays, club.longestTierWindowDays ?? 0));
		const horizonEnd = addDays(today, horizonDays);

		try {
			const newest = await teeSheets.newestTeeTimeDate(club.id);
			// Resume from the newest generated day (inclusive, in case the last run stopped part-way).
			const fromDate = newest && newest > today ? newest : today;
			const schedules = await teeSheets.listSchedules(club.id);
			const budget = Math.min(remainingBudget, TEE_SHEET_LIMITS.maxSlotsPerRun);
			const { toDate, slots } = fromDate > horizonEnd ? { toDate: null, slots: 0 } : rangeWithinBudget(schedules, fromDate, horizonEnd, budget);
			const created = toDate ? await generateForClub(teeSheets, club, schedules, fromDate, toDate, now) : 0;
			remainingBudget -= slots;
			if (toDate !== null && toDate < horizonEnd) {
				logger.warn('tee_sheet.generation_deferred', { orgId: club.id, generatedThrough: toDate, horizonEnd });
			}
			summary.clubs.push({ orgId: club.id, fromDate, toDate, created });
			logger.info('tee_sheet.generated', { orgId: club.id, fromDate, toDate, created });
		} catch (error) {
			// One club's failure must not stop the others.
			logger.error('tee_sheet.generation_failed', { orgId: club.id, error });
		}
	}
	return summary;
}
