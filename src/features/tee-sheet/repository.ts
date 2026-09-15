import { and, asc, between, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { IsoDate } from '../../lib/dates';
import { nines } from '../courses/schema';
import { membershipTiers } from '../memberships/schema';
import { organizations } from '../organizations/schema';
import type { NineSchedule, TeeTimeSlot, WeeklyRule } from './generation';
import { TEE_SHEET_LIMITS } from './limits';
import { teeSheetRules, teeTimes, type TeeTimeStatus } from './schema';

export interface StaffTeeTime {
	id: string;
	time: string;
	startsAt: Date;
	maxPlayers: number;
	bookedPlayers: number;
	status: TeeTimeStatus;
	membersOnly: boolean;
}

export interface TeeSheetDay {
	date: IsoDate;
	nines: { id: string; name: string; teeTimes: StaffTeeTime[] }[];
}

export interface TeeTimeRangeUpdate {
	date: IsoDate;
	fromTime: string;
	toTime: string;
	nineIds?: readonly string[];
	status?: TeeTimeStatus;
	membersOnly?: boolean;
}

export interface SchedulableClub {
	id: string;
	timezone: string;
	publicBookingWindowDays: number;
	longestTierWindowDays: number | null;
}

/** Data access for tee sheet rules and tee times. Every query is scoped by `orgId`. */
export interface TeeSheetRepository {
	listRules(orgId: string, nineId: string): Promise<WeeklyRule[]>;
	replaceRules(orgId: string, nineId: string, rules: readonly WeeklyRule[]): Promise<void>;
	listSchedules(orgId: string): Promise<NineSchedule[]>;
	/** Inserts tee times that don't exist yet and returns how many were created. */
	insertSlots(orgId: string, slots: readonly TeeTimeSlot[], now: Date): Promise<number>;
	teeSheet(orgId: string, date: IsoDate): Promise<TeeSheetDay>;
	updateRange(orgId: string, update: TeeTimeRangeUpdate): Promise<number>;
	clubsWithRules(): Promise<SchedulableClub[]>;
	/** The latest club-local date that has any tee times, or null. */
	newestTeeTimeDate(orgId: string): Promise<IsoDate | null>;
}

const JSON_ARRAY_OVERHEAD_BYTES = 2;
const JSON_SEPARATOR_BYTES = 1;

/**
 * Splits rows into chunks whose JSON encoding stays within `maxBytes`, so each insert statement
 * stays under D1's statement size limit however wide the rows are.
 */
export function chunkRowsByJsonSize<Row>(rows: readonly Row[], maxBytes: number): Row[][] {
	const encoder = new TextEncoder();
	const chunks: Row[][] = [];
	let current: Row[] = [];
	let currentBytes = JSON_ARRAY_OVERHEAD_BYTES;
	for (const row of rows) {
		const rowBytes = encoder.encode(JSON.stringify(row)).length;
		if (current.length > 0 && currentBytes + JSON_SEPARATOR_BYTES + rowBytes > maxBytes) {
			chunks.push(current);
			current = [];
			currentBytes = JSON_ARRAY_OVERHEAD_BYTES;
		}
		currentBytes += (current.length > 0 ? JSON_SEPARATOR_BYTES : 0) + rowBytes;
		current.push(row);
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

const ruleColumns = {
	dayOfWeek: teeSheetRules.dayOfWeek,
	firstTeeMinute: teeSheetRules.firstTeeMinute,
	lastTeeMinute: teeSheetRules.lastTeeMinute,
	intervalMinutes: teeSheetRules.intervalMinutes,
	maxPlayers: teeSheetRules.maxPlayers,
};

export function createTeeSheetRepository(db: Database): TeeSheetRepository {
	return {
		async listRules(orgId, nineId) {
			return db
				.select(ruleColumns)
				.from(teeSheetRules)
				.where(and(eq(teeSheetRules.orgId, orgId), eq(teeSheetRules.nineId, nineId)))
				.orderBy(asc(teeSheetRules.dayOfWeek));
		},

		async replaceRules(orgId, nineId, rules) {
			const removeExisting = db.delete(teeSheetRules).where(and(eq(teeSheetRules.orgId, orgId), eq(teeSheetRules.nineId, nineId)));
			if (rules.length === 0) {
				await removeExisting;
				return;
			}
			await db.batch([removeExisting, db.insert(teeSheetRules).values(rules.map((rule) => ({ orgId, nineId, ...rule })))]);
		},

		async listSchedules(orgId) {
			const rows = await db
				.select({ nineId: teeSheetRules.nineId, ...ruleColumns })
				.from(teeSheetRules)
				.where(eq(teeSheetRules.orgId, orgId));
			const byNine = new Map<string, WeeklyRule[]>();
			for (const { nineId, ...rule } of rows) {
				byNine.set(nineId, [...(byNine.get(nineId) ?? []), rule]);
			}
			return [...byNine.entries()].map(([nineId, rules]) => ({ nineId, rules }));
		},

		async insertSlots(orgId, slots, now) {
			const rows = slots.map((slot) => [crypto.randomUUID(), slot.nineId, slot.startsAt, slot.localDate, slot.localTime, slot.maxPlayers]);
			const timestamp = now.getTime();
			let created = 0;
			// Each statement carries its rows as one JSON parameter (D1 caps bound parameters at 100 per query).
			for (const chunk of chunkRowsByJsonSize(rows, TEE_SHEET_LIMITS.maxInsertJsonBytes)) {
				// `WHERE true` is required by SQLite when an INSERT ... SELECT has an ON CONFLICT clause.
				const result = await db.run(sql`
					INSERT INTO ${teeTimes} (id, org_id, nine_id, starts_at, local_date, local_time, max_players, booked_players, status, members_only, created_at, updated_at)
					SELECT json_extract(value, '$[0]'), ${orgId}, json_extract(value, '$[1]'), json_extract(value, '$[2]'),
						json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), 0, 'open', 0, ${timestamp}, ${timestamp}
					FROM json_each(${JSON.stringify(chunk)}) WHERE true
					ON CONFLICT (nine_id, starts_at) DO NOTHING
				`);
				created += result.meta.changes;
			}
			return created;
		},

		async teeSheet(orgId, date) {
			const clubNines = await db
				.select({ id: nines.id, name: nines.name })
				.from(nines)
				.where(eq(nines.orgId, orgId))
				.orderBy(asc(nines.sortOrder), asc(nines.createdAt), sql`${nines}.rowid`);
			const rows = await db
				.select({
					nineId: teeTimes.nineId,
					id: teeTimes.id,
					time: teeTimes.localTime,
					startsAt: teeTimes.startsAt,
					maxPlayers: teeTimes.maxPlayers,
					bookedPlayers: teeTimes.bookedPlayers,
					status: teeTimes.status,
					membersOnly: teeTimes.membersOnly,
				})
				.from(teeTimes)
				.where(and(eq(teeTimes.orgId, orgId), eq(teeTimes.localDate, date)))
				.orderBy(asc(teeTimes.localTime));

			return {
				date,
				nines: clubNines.map((nine) => ({
					...nine,
					teeTimes: rows
						.filter((row) => row.nineId === nine.id)
						.map((row) => ({
							id: row.id,
							time: row.time,
							startsAt: row.startsAt,
							maxPlayers: row.maxPlayers,
							bookedPlayers: row.bookedPlayers,
							status: row.status,
							membersOnly: row.membersOnly,
						})),
				})),
			};
		},

		async updateRange(orgId, { date, fromTime, toTime, nineIds, status, membersOnly }) {
			const conditions = [eq(teeTimes.orgId, orgId), eq(teeTimes.localDate, date), between(teeTimes.localTime, fromTime, toTime)];
			if (nineIds) conditions.push(inArray(teeTimes.nineId, [...nineIds]));
			const updated = await db
				.update(teeTimes)
				.set({ ...(status !== undefined && { status }), ...(membersOnly !== undefined && { membersOnly }) })
				.where(and(...conditions))
				.returning({ id: teeTimes.id });
			return updated.length;
		},

		async clubsWithRules() {
			return db
				.select({
					id: organizations.id,
					timezone: organizations.timezone,
					publicBookingWindowDays: organizations.publicBookingWindowDays,
					longestTierWindowDays: max(membershipTiers.bookingWindowDays),
				})
				.from(organizations)
				.leftJoin(membershipTiers, eq(membershipTiers.orgId, organizations.id))
				.where(sql`EXISTS (SELECT 1 FROM ${teeSheetRules} WHERE ${teeSheetRules.orgId} = ${organizations.id})`)
				.groupBy(organizations.id);
		},

		async newestTeeTimeDate(orgId) {
			const [row] = await db
				.select({ date: teeTimes.localDate })
				.from(teeTimes)
				.where(eq(teeTimes.orgId, orgId))
				.orderBy(desc(teeTimes.localDate))
				.limit(1);
			return row?.date ?? null;
		},
	};
}
