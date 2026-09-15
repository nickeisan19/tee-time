import type { IsoDate } from '../../lib/dates';
import { notFound, validationError } from '../../lib/errors';
import type { RateLimiter } from '../../lib/rate-limit';
import { addDays, formatClockTime, parseClockTime } from '../../lib/zoned-time';
import type { NineRepository } from '../courses/nine-repository';
import { loadClub, requireClubManager, requireStaffRole } from '../organizations/club-access';
import type { Club, OrganizationRepository } from '../organizations/repository';
import { countTeeTimeSlots, type NineSchedule, slotsForDate, type TeeTimeSlot } from './generation';
import { TEE_SHEET_LIMITS } from './limits';
import type { TeeSheetDay, TeeSheetRepository } from './repository';
import type { TeeSheetRuleInput, UpdateTeeTimesInput } from './validation';

interface TeeSheetServiceDependencies {
	organizations: OrganizationRepository;
	nines: NineRepository;
	teeSheets: TeeSheetRepository;
	rateLimiter?: RateLimiter;
	now?: () => Date;
}

export interface TeeSheetService {
	listRules(slug: string, actorUserId: string, nineId: string): Promise<TeeSheetRuleInput[]>;
	setRules(slug: string, actorUserId: string, nineId: string, rules: readonly TeeSheetRuleInput[]): Promise<TeeSheetRuleInput[]>;
	generate(slug: string, actorUserId: string, fromDate: IsoDate, toDate: IsoDate): Promise<{ created: number }>;
	view(slug: string, actorUserId: string, date: IsoDate): Promise<TeeSheetDay>;
	updateTeeTimes(slug: string, actorUserId: string, update: UpdateTeeTimesInput): Promise<{ updated: number }>;
}

/**
 * Creates any missing tee times for a club between two club-local dates, writing as it goes so
 * memory stays bounded. Returns how many tee times were created.
 */
export async function generateForClub(
	teeSheets: TeeSheetRepository,
	club: Pick<Club, 'id' | 'timezone'>,
	schedules: readonly NineSchedule[],
	fromDate: IsoDate,
	toDate: IsoDate,
	now: Date,
): Promise<number> {
	let created = 0;
	let pending: TeeTimeSlot[] = [];
	for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
		pending.push(...slotsForDate(date, club.timezone, schedules));
		if (pending.length >= TEE_SHEET_LIMITS.flushEverySlots) {
			created += await teeSheets.insertSlots(club.id, pending, now);
			pending = [];
		}
	}
	if (pending.length > 0) created += await teeSheets.insertSlots(club.id, pending, now);
	return created;
}

export function createTeeSheetService({
	organizations,
	nines,
	teeSheets,
	rateLimiter,
	now = () => new Date(),
}: TeeSheetServiceDependencies): TeeSheetService {
	async function requireNinesInClub(club: Club, nineIds: readonly string[]) {
		const found = await nines.findManyInClub(club.id, nineIds);
		if (found.length !== new Set(nineIds).size) throw notFound('Nine not found');
	}

	async function rulesFor(club: Club, nineId: string): Promise<TeeSheetRuleInput[]> {
		const rules = await teeSheets.listRules(club.id, nineId);
		return rules.map((rule) => ({
			dayOfWeek: rule.dayOfWeek,
			firstTee: formatClockTime(rule.firstTeeMinute),
			lastTee: formatClockTime(rule.lastTeeMinute),
			intervalMinutes: rule.intervalMinutes,
			maxPlayers: rule.maxPlayers,
		}));
	}

	return {
		async listRules(slug, actorUserId, nineId) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			await requireNinesInClub(club, [nineId]);
			return rulesFor(club, nineId);
		},

		async setRules(slug, actorUserId, nineId, rules) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			await requireNinesInClub(club, [nineId]);

			await teeSheets.replaceRules(
				club.id,
				nineId,
				rules.map((rule) => ({
					dayOfWeek: rule.dayOfWeek,
					// Validated as HH:MM by the request schema.
					firstTeeMinute: parseClockTime(rule.firstTee) ?? 0,
					lastTeeMinute: parseClockTime(rule.lastTee) ?? 0,
					intervalMinutes: rule.intervalMinutes,
					maxPlayers: rule.maxPlayers,
				})),
			);
			return rulesFor(club, nineId);
		},

		async generate(slug, actorUserId, fromDate, toDate) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			await rateLimiter?.enforce([{ rule: TEE_SHEET_LIMITS.generateRuns, subject: club.id }]);

			const schedules = await teeSheets.listSchedules(club.id);
			const expected = countTeeTimeSlots({ timezone: club.timezone, fromDate, toDate, nines: schedules });
			if (expected > TEE_SHEET_LIMITS.maxSlotsPerRun) {
				throw validationError(
					`That range would create about ${expected} tee times; generate at most ${TEE_SHEET_LIMITS.maxSlotsPerRun} at a time by choosing fewer days`,
				);
			}
			return { created: await generateForClub(teeSheets, club, schedules, fromDate, toDate, now()) };
		},

		async view(slug, actorUserId, date) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			return teeSheets.teeSheet(club.id, date);
		},

		async updateTeeTimes(slug, actorUserId, update) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			await rateLimiter?.enforce([{ rule: TEE_SHEET_LIMITS.teeTimeUpdates, subject: actorUserId }]);
			if (update.nineIds) await requireNinesInClub(club, update.nineIds);
			return { updated: await teeSheets.updateRange(club.id, update) };
		},
	};
}
