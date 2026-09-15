import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../../src/db/client';
import { bookings } from '../../../src/db/schema';
import { createBookingRepository, type NewBooking } from '../../../src/features/bookings/repository';
import { isCheckViolation } from '../../../src/db/errors';
import { createVerifiedUser } from '../../helpers';
import { type TeeSheet, updateTeeTimes, viewTeeSheet } from '../courses/helpers';
import { data, setUpClub } from '../memberships/helpers';
import { book, bookedPlayers, daysFromToday, setUpCourse, teeTimeId } from './helpers';

const db = createDb(env.DB);
const repository = createBookingRepository(db);
const DATE = daysFromToday(2);

function eighteenHoleBooking(
	overrides: Partial<NewBooking> & Pick<NewBooking, 'orgId' | 'bookedByUserId' | 'routeId' | 'startNineId' | 'legs'>,
): NewBooking {
	return {
		id: crypto.randomUUID(),
		holes: 18,
		totalCents: null,
		players: [
			{ position: 1, userId: overrides.bookedByUserId, guestName: null, rateAudience: 'public', rateCents: null },
			{ position: 2, userId: null, guestName: 'Guest', rateAudience: 'public', rateCents: null },
		],
		isMember: false,
		now: new Date(),
		...overrides,
	};
}

describe('booking batch', () => {
	it('writes nothing when a later leg is full, even if the first leg had room', async () => {
		const setup = await setUpClub();
		const course = await setUpCourse(setup, 3);
		const golfer = await createVerifiedUser(setup.client, 'Golfer');
		const start = await teeTimeId(setup, course.front, DATE, '07:00');
		const crossover = await teeTimeId(setup, course.back, DATE, '09:00');
		await book(setup, golfer, { holes: 9, teeTimeId: crossover, guests: [{ name: 'A' }, { name: 'B' }] });
		const booking = eighteenHoleBooking({
			orgId: setup.clubId,
			bookedByUserId: golfer.userId,
			routeId: course.route.id,
			startNineId: course.front.id,
			legs: [
				{ leg: 1, teeTimeId: start },
				{ leg: 2, teeTimeId: crossover },
			],
		});

		const attempt = repository.create(booking);

		await expect(attempt).rejects.toSatisfy((error) => isCheckViolation(error, 'tee_times_capacity_check'));
		expect(await bookedPlayers(setup, course.front, DATE, '07:00')).toBe(0);
		expect(await bookedPlayers(setup, course.back, DATE, '09:00')).toBe(3);
		expect(await db.select().from(bookings).where(eq(bookings.id, booking.id))).toEqual([]);
	});

	it('writes nothing when a leg was blocked after the golfer picked it', async () => {
		const setup = await setUpClub();
		const course = await setUpCourse(setup, 3);
		const golfer = await createVerifiedUser(setup.client, 'Golfer');
		const start = await teeTimeId(setup, course.front, DATE, '07:00');
		await updateTeeTimes(setup, setup.owner, {
			date: DATE,
			fromTime: '07:00',
			toTime: '07:00',
			nineIds: [course.front.id],
			status: 'blocked',
		});

		const attempt = repository.create({
			...eighteenHoleBooking({
				orgId: setup.clubId,
				bookedByUserId: golfer.userId,
				routeId: null,
				startNineId: course.front.id,
				legs: [{ leg: 1, teeTimeId: start }],
			}),
			holes: 9,
		});

		await expect(attempt).rejects.toSatisfy((error) => isCheckViolation(error, 'tee_times_capacity_check'));
		expect(await bookedPlayers(setup, course.front, DATE, '07:00')).toBe(0);
	});

	it('refuses a leg that belongs to another club instead of skipping its seat hold', async () => {
		const setup = await setUpClub();
		const course = await setUpCourse(setup, 3);
		const otherClub = await setUpClub('Other Club');
		const otherCourse = await setUpCourse(otherClub, 3);
		const golfer = await createVerifiedUser(setup.client, 'Golfer');
		const foreignTeeTime = await teeTimeId(otherClub, otherCourse.front, DATE, '07:00');
		const booking = {
			...eighteenHoleBooking({ orgId: setup.clubId, bookedByUserId: golfer.userId, routeId: null, startNineId: course.front.id, legs: [{ leg: 1 as const, teeTimeId: foreignTeeTime }] }),
			holes: 9 as const,
		};

		await expect(repository.create(booking)).rejects.toThrow();

		expect(await db.select().from(bookings).where(eq(bookings.id, booking.id))).toEqual([]);
		expect(await bookedPlayers(otherClub, otherCourse.front, DATE, '07:00')).toBe(0);
	});
});

describe('listing many bookings', () => {
	it('lists more bookings than fit in one query’s parameters', async () => {
		const setup = await setUpClub();
		const course = await setUpCourse(setup, 3);
		const golfer = await createVerifiedUser(setup.client, 'Regular');
		const sheet = await data<TeeSheet>(await viewTeeSheet(setup, setup.owner, DATE));
		const teeTimeIds = sheet.nines.flatMap((nine) => nine.teeTimes.map((teeTime) => teeTime.id));
		const BOOKING_COUNT = 101;

		for (let index = 0; index < BOOKING_COUNT; index++) {
			await repository.create({
				id: crypto.randomUUID(),
				orgId: setup.clubId,
				bookedByUserId: golfer.userId,
				holes: 9,
				routeId: null,
				startNineId: course.front.id,
				totalCents: null,
				// 50 tee times with room for 4 each: cycle through them one player at a time.
				legs: [{ leg: 1, teeTimeId: teeTimeIds[index % teeTimeIds.length] }],
				players: [{ position: 1, userId: golfer.userId, guestName: null, rateAudience: 'public', rateCents: null }],
				isMember: false,
				now: new Date(),
			});
		}

		const mine = await setup.client.request(`/api/orgs/${setup.slug}/bookings/mine`, { cookie: golfer.cookie });
		const forDate = await setup.client.request(`/api/orgs/${setup.slug}/bookings?date=${DATE}`, { cookie: setup.owner.cookie });

		expect(mine.status).toBe(200);
		expect(await data<unknown[]>(mine)).toHaveLength(BOOKING_COUNT);
		expect(forDate.status).toBe(200);
		const staffList = await data<{ teeTimes: unknown[]; players: unknown[] }[]>(forDate);
		expect(staffList).toHaveLength(BOOKING_COUNT);
		expect(staffList.every((booking) => booking.teeTimes.length === 1 && booking.players.length === 1)).toBe(true);
	});
});
