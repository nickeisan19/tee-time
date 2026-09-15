import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { IsoDate } from '../../lib/dates';
import { users } from '../auth/schema';
import { nines, routes } from '../courses/schema';
import { teeTimes } from '../tee-sheet/schema';
import type { AvailabilityTeeTime } from './availability';
import { bookingPlayers, bookings, type BookingStatus, bookingTeeTimes, type PaymentStatus } from './schema';

export interface BookableTeeTime extends AvailabilityTeeTime {
	localDate: IsoDate;
	localTime: string;
}

export interface BookingLeg {
	leg: 1 | 2;
	teeTimeId: string;
}

export type PlayerRateAudience = 'member' | 'member_guest' | 'public';

export interface NewBookingPlayer {
	position: number;
	userId: string | null;
	guestName: string | null;
	rateAudience: PlayerRateAudience;
	rateCents: number | null;
}

export interface NewBooking {
	id: string;
	orgId: string;
	bookedByUserId: string;
	holes: 9 | 18;
	routeId: string | null;
	startNineId: string;
	totalCents: number | null;
	legs: readonly BookingLeg[];
	players: readonly NewBookingPlayer[];
	/** Whether the booker may take members-only tee times. */
	isMember: boolean;
	now: Date;
}

export interface BookingView {
	id: string;
	status: BookingStatus;
	holes: number;
	playerCount: number;
	route: { id: string; name: string } | null;
	teeTimes: { leg: number; teeTimeId: string; nine: { id: string; name: string }; date: IsoDate; time: string; startsAt: Date }[];
	players: { position: number; name: string; isBooker: boolean; rateAudience: PlayerRateAudience; rateCents: number | null }[];
	totalCents: number | null;
	paymentStatus: PaymentStatus;
	bookedBy: { id: string; name: string; email: string };
	createdAt: Date;
	cancelledAt: Date | null;
}

export interface BookingSummary {
	id: string;
	status: BookingStatus;
	bookedByUserId: string;
	startsAt: Date;
}

/** Data access for bookings. Every query is scoped by `orgId`. */
export interface BookingRepository {
	findTeeTime(orgId: string, teeTimeId: string): Promise<BookableTeeTime | null>;
	teeTimesOnDate(orgId: string, date: IsoDate): Promise<BookableTeeTime[]>;
	/**
	 * Holds every leg and writes the booking in one transaction. Throws if any leg is full, blocked,
	 * or members-only for a non-member (the tee_times capacity CHECK aborts the whole batch).
	 */
	create(booking: NewBooking): Promise<void>;
	/** Cancels a confirmed booking and releases its seats in one transaction. Returns whether it changed. */
	cancel(orgId: string, bookingId: string, cancelledByUserId: string, now: Date): Promise<boolean>;
	findSummary(orgId: string, bookingId: string): Promise<BookingSummary | null>;
	findView(orgId: string, bookingId: string): Promise<BookingView | null>;
	listForBooker(orgId: string, userId: string): Promise<BookingView[]>;
	listForDate(orgId: string, date: IsoDate): Promise<BookingView[]>;
}

/** Added to booked_players when a leg may not be booked; always exceeds the capacity CHECK. */
const UNBOOKABLE_INCREMENT = 1000;
const MAX_LISTED_BOOKINGS = 200;
/** D1 allows 100 bound parameters per query; leave room for the other parameters in each query. */
const IDS_PER_QUERY = 90;

const teeTimeColumns = {
	id: teeTimes.id,
	nineId: teeTimes.nineId,
	startsAt: teeTimes.startsAt,
	maxPlayers: teeTimes.maxPlayers,
	bookedPlayers: teeTimes.bookedPlayers,
	status: teeTimes.status,
	membersOnly: teeTimes.membersOnly,
	localDate: teeTimes.localDate,
	localTime: teeTimes.localTime,
};

type TeeTimeRow = Omit<BookableTeeTime, 'startsAt'> & { startsAt: Date };

const toBookable = (row: TeeTimeRow): BookableTeeTime => ({ ...row, startsAt: row.startsAt.getTime() });

export function createBookingRepository(db: Database): BookingRepository {
	/** Loads full views for bookings in the club, preserving the order of `bookingIds`. */
	async function viewsFor(orgId: string, bookingIds: readonly string[]): Promise<BookingView[]> {
		const views: BookingView[] = [];
		for (let start = 0; start < bookingIds.length; start += IDS_PER_QUERY) {
			views.push(...(await viewsForChunk(orgId, bookingIds.slice(start, start + IDS_PER_QUERY))));
		}
		return views;
	}

	async function viewsForChunk(orgId: string, bookingIds: readonly string[]): Promise<BookingView[]> {
		if (bookingIds.length === 0) return [];
		const ids = [...bookingIds];

		const [bookingRows, legRows, playerRows] = await Promise.all([
			db
				.select({
					id: bookings.id,
					status: bookings.status,
					holes: bookings.holes,
					playerCount: bookings.playerCount,
					route: { id: routes.id, name: routes.name },
					totalCents: bookings.totalCents,
					paymentStatus: bookings.paymentStatus,
					bookedBy: { id: users.id, name: users.name, email: users.email },
					createdAt: bookings.createdAt,
					cancelledAt: bookings.cancelledAt,
				})
				.from(bookings)
				.innerJoin(users, eq(users.id, bookings.bookedByUserId))
				.leftJoin(routes, eq(routes.id, bookings.routeId))
				.where(and(eq(bookings.orgId, orgId), inArray(bookings.id, ids))),
			db
				.select({
					bookingId: bookingTeeTimes.bookingId,
					leg: bookingTeeTimes.leg,
					teeTimeId: teeTimes.id,
					nine: { id: nines.id, name: nines.name },
					date: teeTimes.localDate,
					time: teeTimes.localTime,
					startsAt: teeTimes.startsAt,
				})
				.from(bookingTeeTimes)
				.innerJoin(teeTimes, and(eq(teeTimes.id, bookingTeeTimes.teeTimeId), eq(teeTimes.orgId, orgId)))
				.innerJoin(nines, eq(nines.id, teeTimes.nineId))
				.where(inArray(bookingTeeTimes.bookingId, ids))
				.orderBy(asc(bookingTeeTimes.leg)),
			db
				.select({
					bookingId: bookingPlayers.bookingId,
					position: bookingPlayers.position,
					userId: bookingPlayers.userId,
					userName: users.name,
					guestName: bookingPlayers.guestName,
					rateAudience: bookingPlayers.rateAudience,
					rateCents: bookingPlayers.rateCents,
				})
				.from(bookingPlayers)
				.leftJoin(users, eq(users.id, bookingPlayers.userId))
				.where(inArray(bookingPlayers.bookingId, ids))
				.orderBy(asc(bookingPlayers.position)),
		]);

		const viewsById = new Map(
			bookingRows.map((row) => [
				row.id,
				{
					...row,
					teeTimes: legRows
						.filter((leg) => leg.bookingId === row.id)
						.map((leg) => ({
							leg: leg.leg,
							teeTimeId: leg.teeTimeId,
							nine: leg.nine,
							date: leg.date,
							time: leg.time,
							startsAt: leg.startsAt,
						})),
					players: playerRows
						.filter((player) => player.bookingId === row.id)
						.map((player) => ({
							position: player.position,
							name: player.guestName ?? player.userName ?? 'Former member',
							isBooker: player.userId !== null && player.userId === row.bookedBy.id,
							rateAudience: player.rateAudience,
							rateCents: player.rateCents,
						})),
				} satisfies BookingView,
			]),
		);
		return ids.flatMap((id) => viewsById.get(id) ?? []);
	}

	// Queries needing a booking's start time join its first tee time explicitly: a correlated subquery in a
	// join-free select has its column names emitted unqualified by Drizzle and resolves against the wrong table.
	return {
		async findTeeTime(orgId, teeTimeId) {
			const [row] = await db
				.select(teeTimeColumns)
				.from(teeTimes)
				.where(and(eq(teeTimes.orgId, orgId), eq(teeTimes.id, teeTimeId)))
				.limit(1);
			return row ? toBookable(row) : null;
		},

		async teeTimesOnDate(orgId, date) {
			const rows = await db
				.select(teeTimeColumns)
				.from(teeTimes)
				.where(and(eq(teeTimes.orgId, orgId), eq(teeTimes.localDate, date)))
				.orderBy(asc(teeTimes.startsAt));
			return rows.map(toBookable);
		},

		async create({ id, orgId, bookedByUserId, holes, routeId, startNineId, totalCents, legs, players, isMember, now }) {
			const playerCount = players.length;
			const holdLeg = (leg: BookingLeg) =>
				db
					.update(teeTimes)
					.set({
						bookedPlayers: sql`${teeTimes.bookedPlayers} + CASE
							WHEN ${teeTimes.status} = 'open' AND (${teeTimes.membersOnly} = 0 OR ${isMember ? 1 : 0} = 1)
							THEN ${playerCount} ELSE ${UNBOOKABLE_INCREMENT} END`,
						updatedAt: now,
					})
					.where(and(eq(teeTimes.orgId, orgId), eq(teeTimes.id, leg.teeTimeId)));

			const [firstLeg, ...otherLegs] = legs;
			await db.batch([
				holdLeg(firstLeg),
				...otherLegs.map(holdLeg),
				db.insert(bookings).values({
					id,
					orgId,
					bookedByUserId,
					holes,
					routeId,
					startNineId,
					playerCount,
					totalCents,
					createdAt: now,
					updatedAt: now,
				}),
				// Each leg's tee time is looked up within the club: a tee time from another club resolves to NULL,
				// fails the NOT NULL constraint, and aborts the batch rather than skipping that leg's seat hold.
				db.insert(bookingTeeTimes).values(
					legs.map((leg) => ({
						bookingId: id,
						teeTimeId: sql`(SELECT ${teeTimes.id} FROM ${teeTimes} WHERE ${teeTimes.id} = ${leg.teeTimeId} AND ${teeTimes.orgId} = ${orgId})`,
						leg: leg.leg,
					})),
				),
				db.insert(bookingPlayers).values(players.map((player) => ({ bookingId: id, ...player, createdAt: now }))),
			]);
		},

		async cancel(orgId, bookingId, cancelledByUserId, now) {
			const [cancelled] = await db.batch([
				db
					.update(bookings)
					.set({ status: 'cancelled', cancelledAt: now, cancelledByUserId, updatedAt: now })
					.where(and(eq(bookings.orgId, orgId), eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
					.returning({ id: bookings.id }),
				// changes() is the row count of the cancellation above: seats are only released if it happened.
				db
					.update(teeTimes)
					.set({
						bookedPlayers: sql`${teeTimes.bookedPlayers} - (SELECT ${bookings.playerCount} FROM ${bookings} WHERE ${bookings.id} = ${bookingId})`,
						updatedAt: now,
					})
					.where(
						and(
							eq(teeTimes.orgId, orgId),
							sql`${teeTimes.id} IN (SELECT ${bookingTeeTimes.teeTimeId} FROM ${bookingTeeTimes} WHERE ${bookingTeeTimes.bookingId} = ${bookingId})`,
							sql`changes() > 0`,
						),
					),
			]);
			return cancelled.length > 0;
		},

		async findSummary(orgId, bookingId) {
			const [row] = await db
				.select({ id: bookings.id, status: bookings.status, bookedByUserId: bookings.bookedByUserId, startsAt: teeTimes.startsAt })
				.from(bookings)
				.innerJoin(bookingTeeTimes, and(eq(bookingTeeTimes.bookingId, bookings.id), eq(bookingTeeTimes.leg, 1)))
				.innerJoin(teeTimes, and(eq(teeTimes.id, bookingTeeTimes.teeTimeId), eq(teeTimes.orgId, orgId)))
				.where(and(eq(bookings.orgId, orgId), eq(bookings.id, bookingId)))
				.limit(1);
			return row ?? null;
		},

		async findView(orgId, bookingId) {
			const [row] = await db
				.select({ id: bookings.id })
				.from(bookings)
				.where(and(eq(bookings.orgId, orgId), eq(bookings.id, bookingId)))
				.limit(1);
			if (!row) return null;
			const [view] = await viewsFor(orgId, [row.id]);
			return view ?? null;
		},

		async listForBooker(orgId, userId) {
			const rows = await db
				.select({ id: bookings.id })
				.from(bookings)
				.innerJoin(bookingTeeTimes, and(eq(bookingTeeTimes.bookingId, bookings.id), eq(bookingTeeTimes.leg, 1)))
				.innerJoin(teeTimes, eq(teeTimes.id, bookingTeeTimes.teeTimeId))
				.where(and(eq(bookings.orgId, orgId), eq(bookings.bookedByUserId, userId)))
				.orderBy(desc(teeTimes.startsAt), desc(bookings.createdAt))
				.limit(MAX_LISTED_BOOKINGS);
			return viewsFor(orgId, rows.map((row) => row.id));
		},

		async listForDate(orgId, date) {
			const rows = await db
				.select({ id: bookings.id })
				.from(bookings)
				.innerJoin(bookingTeeTimes, and(eq(bookingTeeTimes.bookingId, bookings.id), eq(bookingTeeTimes.leg, 1)))
				.innerJoin(teeTimes, eq(teeTimes.id, bookingTeeTimes.teeTimeId))
				.where(and(eq(bookings.orgId, orgId), eq(teeTimes.localDate, date)))
				.orderBy(asc(teeTimes.startsAt), asc(bookings.createdAt), sql`${bookings}.rowid`)
				.limit(MAX_LISTED_BOOKINGS);
			return viewsFor(orgId, rows.map((row) => row.id));
		},
	};
}
